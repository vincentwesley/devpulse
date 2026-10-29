import type { Env } from "./env";
import { CODEFREQ_MAX, CODEFREQ_WEEKS, LOC_RETRY_GAP_S, LOC_RETRY_MAX } from "./config";
import { API, gql, ghHeaders, TOPICS } from "./github";
import { isEligible } from "./lib/github-parse";
import { pool, TIMEOUT_MS } from "./lib/http";

// Private list is one page (100). More than that, or more than PRIV_QUOTA eligible, leaves the stored aggregate untouched.
const PRIV_QUOTA = 10;
const PRIVATE_QUERY = `query{viewer{repositories(first:100,privacy:PRIVATE,ownerAffiliations:OWNER,isFork:false){pageInfo{hasNextPage} nodes{nameWithOwner isArchived ${TOPICS}}}}}`;

/** `/stats/code_frequency` body ([week, additions, deletions<=0][]) -> churn estimate + last-26-week series, or null if malformed. */
export function parseCodeFreq(j: unknown): { loc: number; series: [number, number, number][] } | null {
  if (!Array.isArray(j) || !j.every((r) => Array.isArray(r) && r.length === 3 && r.every((n) => Number.isFinite(n)))) return null;
  // ponytail: loc = additions + |deletions| summed over all weeks is churn, not net lines (it over-counts); the UI labels it an estimate.
  const series = (j as number[][]).map(([w, a, d]): [number, number, number] => [w, a, Math.abs(d)]);
  return { loc: series.reduce((s, r) => s + r[1] + r[2], 0), series: series.slice(-CODEFREQ_WEEKS) };
}

interface Out { priv: boolean; repo: string; code: number; body?: unknown }
const EMPTY = [204, 404, 422]; // no stats to give (empty repo / too many commits): final answer, counts as 0
const day = (d: Date) => d.toISOString().slice(0, 10);
const setMeta = (db: D1Database, key: string, value: string) => db.prepare("INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, value);

/** Eligible private repo names (memory only), or null when the list is incomplete/failed: the old aggregate is then kept. */
async function listPrivate(env: Env): Promise<string[] | null> {
  try {
    const conn = (await gql<{ data?: { viewer?: { repositories: { pageInfo?: { hasNextPage: boolean }; nodes: ({ nameWithOwner: string; isArchived: boolean; repositoryTopics?: { nodes?: ({ topic: { name: string } } | null)[] } } | null)[] } } } }>(env, PRIVATE_QUERY, {})).data?.viewer?.repositories;
    const nodes = conn?.pageInfo?.hasNextPage ? undefined : conn?.nodes; // more than one page: list incomplete, keep the old total
    return nodes ? nodes.flatMap((n) => n && isEligible({ archived: n.isArchived, topics: (n.repositoryTopics?.nodes ?? []).flatMap((t) => (t ? [t.topic.name] : [])) }) ? [n.nameWithOwner] : []) : null;
  } catch { console.warn("private repo list failed"); return null; }
}

const fetchFreq = (env: Env, targets: { repo: string; priv: boolean }[]) => {
  const h = ghHeaders(env);
  return pool(targets, 5, async (t): Promise<Out> => {
    try {
      const r = await fetch(`${API}/repos/${t.repo}/stats/code_frequency`, { headers: h, signal: AbortSignal.timeout(TIMEOUT_MS) });
      return { ...t, code: r.status, body: r.status === 200 ? await r.json() : undefined };
    } catch { return { ...t, code: 0 }; } // never log the error: it may carry a private repo name
  });
};

/** Answers -> statements. 202 (GitHub still computing) and errors write nothing, so a later pass retries. Private: aggregate only, and only if every repo answered. */
function apply(db: D1Database, outs: Out[], privListed: boolean, now: Date): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  let privLoc = 0, privOk = privListed;
  for (const o of outs) {
    const p = o.code === 200 ? parseCodeFreq(o.body) : null;
    if (o.priv) {
      if (p) privLoc += p.loc;
      else if (!EMPTY.includes(o.code)) privOk = false;
    } else if (p) {
      stmts.push(
        db.prepare("UPDATE projects SET loc=?, loc_at=? WHERE repo=?").bind(p.loc, now.toISOString().replace(/\.\d{3}Z$/, "Z"), o.repo),
        db.prepare("DELETE FROM code_freq WHERE repo=?").bind(o.repo),
        db.prepare(`INSERT INTO code_freq (repo,week,"add","del") SELECT ?1, json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]') FROM json_each(?2)`).bind(o.repo, JSON.stringify(p.series)),
      );
    } else if (EMPTY.includes(o.code)) stmts.push(db.prepare("UPDATE projects SET loc=COALESCE(loc,0), loc_at=? WHERE repo=?").bind(now.toISOString().replace(/\.\d{3}Z$/, "Z"), o.repo)); // final: stop retrying it
  }
  if (privOk) stmts.push(db.prepare("INSERT INTO private_agg (id,loc) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET loc=excluded.loc").bind(privLoc), setMeta(db, "loc_priv_done", day(now)));
  return stmts;
}

/**
 * Daily 00:30 UTC slot: code_frequency for public (from D1) and private (listed in memory, never stored) repos.
 * 202 (still computing) keeps the old value and is finished by retryLoc; 204/404/422 count as 0; other errors skip the repo.
 * Private repos only ever update the single aggregate row, and only when every private repo answered (and there are <= PRIV_QUOTA).
 * Public repos beyond the remaining quota: changed ones first (never counted, or pushed since `loc_at`), then the longest-unchecked.
 */
export async function syncLoc(env: Env, now = new Date()): Promise<void> {
  if (!env.GITHUB_TOKEN) return console.warn("GITHUB_TOKEN missing, skipping LOC sync");
  const db = env.DB;
  const { results } = await db.prepare("SELECT repo FROM projects ORDER BY (loc_at IS NULL OR pushed_at > loc_at) DESC, loc_at, pushed_at DESC").all<{ repo: string }>();
  const priv = await listPrivate(env);

  // Over-quota private lists are not sampled (a partial sum would be wrong): their budget goes to public repos.
  const privT = priv && priv.length <= PRIV_QUOTA ? priv : [];
  const pubQ = CODEFREQ_MAX - privT.length;
  const pubT = results.slice(0, pubQ);
  const outs = await fetchFreq(env, [...pubT.map((r) => ({ repo: r.repo, priv: false })), ...privT.map((repo) => ({ repo, priv: true }))]);
  const stmts = apply(db, outs, priv !== null && priv.length <= PRIV_QUOTA, now);
  if (stmts.length) await db.batch(stmts);
  console.log(`loc: ${outs.filter((o) => o.code === 200).length}/${outs.length} repos updated`);
}

/**
 * Hourly + 15-min slots: finish what the daily pass left pending (typically 202). At most LOC_RETRY_MAX fetches in total.
 * Public repos with loc IS NULL go first (never-attempted before retried, newest push first), each at most once per
 * LOC_RETRY_GAP_S (`meta` loc_try:<repo>). Only when none are pending does the private aggregate get a turn, and only if
 * the list call plus every private repo fit the cap (bigger lists wait for the daily pass). `loc_priv_done` = UTC day
 * that needs no more private tries.
 */
export async function retryLoc(env: Env, now = new Date()): Promise<void> {
  if (!env.GITHUB_TOKEN) return;
  const db = env.DB, t = String(Math.floor(now.getTime() / 1000)), cut = Number(t) - LOC_RETRY_GAP_S;
  const pend = (await db.prepare(
    "SELECT p.repo FROM projects p LEFT JOIN meta m ON m.key = 'loc_try:' || p.repo WHERE p.loc IS NULL AND (m.value IS NULL OR CAST(m.value AS INTEGER) < ?) ORDER BY m.value IS NOT NULL, p.pushed_at DESC LIMIT ?",
  ).bind(cut, LOC_RETRY_MAX).all<{ repo: string }>()).results.slice(0, LOC_RETRY_MAX);
  let targets = pend.map((r) => ({ repo: r.repo, priv: false }));
  const stmts = targets.map((x) => setMeta(db, `loc_try:${x.repo}`, t));
  let privListed = false;
  if (!targets.length) {
    const m = new Map((await db.prepare("SELECT key, value FROM meta WHERE key IN ('loc_priv_done','loc_try:@priv')").all<{ key: string; value: string }>()).results.map((r) => [r.key, r.value]));
    if (m.get("loc_priv_done") === day(now) || Number(m.get("loc_try:@priv") ?? 0) >= cut) return;
    stmts.push(setMeta(db, "loc_try:@priv", t));
    const priv = await listPrivate(env);
    if (priv && priv.length < LOC_RETRY_MAX) { privListed = true; targets = priv.map((repo) => ({ repo, priv: true })); }
    else if (priv) stmts.push(setMeta(db, "loc_priv_done", day(now))); // too many for a retry: the daily pass owns it
  }
  stmts.push(...apply(db, await fetchFreq(env, targets), privListed, now));
  if (stmts.length) await db.batch(stmts);
}
