import type { Env } from "./env";
import { CODEFREQ_MAX, CODEFREQ_WEEKS } from "./config";
import { API, gql, ghHeaders, TOPICS } from "./github";
import { isEligible } from "./lib/github-parse";
import { pool, TIMEOUT_MS } from "./lib/http";

// ponytail: first 100 private repos only (one page); add paging if the owner ever has more.
const PRIVATE_QUERY = `query{viewer{repositories(first:100,privacy:PRIVATE,ownerAffiliations:OWNER,isFork:false){nodes{nameWithOwner isArchived ${TOPICS}}}}}`;

/** `/stats/code_frequency` body ([week, additions, deletions<=0][]) -> churn estimate + last-26-week series, or null if malformed. */
export function parseCodeFreq(j: unknown): { loc: number; series: [number, number, number][] } | null {
  if (!Array.isArray(j) || !j.every((r) => Array.isArray(r) && r.length === 3 && r.every((n) => Number.isFinite(n)))) return null;
  // ponytail: loc = additions + |deletions| summed over all weeks is churn, not net lines (it over-counts); the UI labels it an estimate.
  const series = (j as number[][]).map(([w, a, d]): [number, number, number] => [w, a, Math.abs(d)]);
  return { loc: series.reduce((s, r) => s + r[1] + r[2], 0), series: series.slice(-CODEFREQ_WEEKS) };
}

interface Out { priv: boolean; repo: string; code: number; body?: unknown }

/**
 * Daily 00:30 UTC slot: code_frequency for public (from D1) and private (listed in memory, never stored) repos.
 * 202 (still computing) keeps the old value; 422 (too many commits) / other errors skip the repo.
 * Private repos only ever update the single aggregate row, and only when every private repo answered.
 */
export async function syncLoc(env: Env): Promise<void> {
  if (!env.GITHUB_TOKEN) return console.warn("GITHUB_TOKEN missing, skipping LOC sync");
  const db = env.DB;
  const { results } = await db.prepare("SELECT repo FROM projects ORDER BY pushed_at DESC").all<{ repo: string }>();
  let priv: string[] | null = null; // null = could not list, keep the old private total
  try {
    const nodes = (await gql<{ data?: { viewer?: { repositories: { nodes: ({ nameWithOwner: string; isArchived: boolean; repositoryTopics?: { nodes?: ({ topic: { name: string } } | null)[] } } | null)[] } } } }>(env, PRIVATE_QUERY, {})).data?.viewer?.repositories.nodes;
    if (nodes) priv = nodes.flatMap((n) => n && isEligible({ archived: n.isArchived, topics: (n.repositoryTopics?.nodes ?? []).flatMap((t) => (t ? [t.topic.name] : [])) }) ? [n.nameWithOwner] : []);
  } catch { console.warn("private repo list failed"); }

  const targets = [...results.map((r) => ({ repo: r.repo, priv: false })), ...(priv ?? []).map((repo) => ({ repo, priv: true }))].slice(0, CODEFREQ_MAX);
  const h = ghHeaders(env);
  const outs = await pool(targets, 5, async (t): Promise<Out> => {
    try {
      const r = await fetch(`${API}/repos/${t.repo}/stats/code_frequency`, { headers: h, signal: AbortSignal.timeout(TIMEOUT_MS) });
      return { ...t, code: r.status, body: r.status === 200 ? await r.json() : undefined };
    } catch { return { ...t, code: 0 }; } // never log the error: it may carry a private repo name
  });

  const stmts: D1PreparedStatement[] = [];
  let privLoc = 0, privOk = priv !== null && outs.filter((o) => o.priv).length === (priv?.length ?? 0);
  for (const o of outs) {
    const p = o.code === 200 ? parseCodeFreq(o.body) : null;
    if (o.priv) {
      if (p) privLoc += p.loc;
      else if (o.code !== 422) privOk = false; // 202 / errors: retry tomorrow, keep the old aggregate
    } else if (p) {
      stmts.push(
        db.prepare("UPDATE projects SET loc=? WHERE repo=?").bind(p.loc, o.repo),
        db.prepare("DELETE FROM code_freq WHERE repo=?").bind(o.repo),
        db.prepare(`INSERT INTO code_freq (repo,week,"add","del") SELECT ?1, json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]') FROM json_each(?2)`).bind(o.repo, JSON.stringify(p.series)),
      );
    }
  }
  if (privOk) stmts.push(db.prepare("INSERT INTO private_agg (id,loc) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET loc=excluded.loc").bind(privLoc));
  if (stmts.length) await db.batch(stmts);
  console.log(`loc: ${outs.filter((o) => o.code === 200).length}/${outs.length} repos updated`);
}
