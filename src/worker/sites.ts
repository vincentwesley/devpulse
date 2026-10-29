import type { Env } from "./env";
import { PROBE_RETRY_S, PROBES_PER_SLOT } from "./config";
import { TIMEOUT_MS, UA } from "./lib/http";
import { isUp } from "./lib/statuspage";
import { nextProbe, type Cand } from "./lib/site";

const parseCands = (t: string | null): Cand[] => { try { const a = JSON.parse(t ?? "[]"); return Array.isArray(a) ? a.filter((c) => typeof c?.url === "string" && typeof c?.src === "string") : []; } catch { return []; } };

/** One GET (no redirect follow); a 2xx/3xx answer means a site is served there. */
export async function probe(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    await r.body?.cancel().catch(() => {});
    return isUp(r.status);
  } catch { return false; }
}

/**
 * Live-site discovery for public repos without a Website field (non-hourly slots, <= PROBES_PER_SLOT fetches).
 * Candidates (detail pass, in priority order) are tried one per slot each: the first that answers becomes `url`.
 * If every candidate fails the url is cleared ("no live URL found") and the list is retried after PROBE_RETRY_S.
 */
export async function runProbes(env: Env, now = new Date()): Promise<void> {
  const t = Math.floor(+now / 1000);
  const { results } = await env.DB.prepare(
    "SELECT repo, site_cands, probe_url, probe_ok, probe_at FROM projects WHERE (url_source IS NULL OR url_source <> 'website') AND site_cands IS NOT NULL AND site_cands <> '[]' AND (probe_at IS NULL OR probe_ok = 0) ORDER BY probe_at IS NOT NULL, probe_at, pushed_at DESC",
  ).all<{ repo: string; site_cands: string | null; probe_url: string | null; probe_ok: number | null; probe_at: number | null }>();
  const due = results.flatMap((r) => { const c = parseCands(r.site_cands), n = nextProbe(c, r.probe_url, r.probe_ok, r.probe_at, t, PROBE_RETRY_S); return n ? [{ repo: r.repo, c: n, last: c[c.length - 1].url === n.url }] : []; }).slice(0, PROBES_PER_SLOT);
  if (!due.length) return;
  const res = await Promise.all(due.map(async (d) => ({ ...d, ok: await probe(d.c.url) })));
  await env.DB.batch(res.map((d) => d.ok
    ? env.DB.prepare("UPDATE projects SET url=?, url_source=?, probe_url=?, probe_ok=1, probe_at=? WHERE repo=? AND (url_source IS NULL OR url_source <> 'website')").bind(d.c.url, d.c.src, d.c.url, t, d.repo)
    : env.DB.prepare(`UPDATE projects SET probe_url=?, probe_ok=0, probe_at=?${d.last ? ", url=NULL, url_source=NULL" : ""} WHERE repo=? AND (url_source IS NULL OR url_source <> 'website')`).bind(d.c.url, t, d.repo)));
}
