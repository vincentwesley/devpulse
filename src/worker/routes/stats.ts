import type { Env } from "../env";
import { HEATMAP_DAYS } from "../config";
import { json } from "../lib/http";
import { computeHealth, type JobRow } from "../lib/jobs";
import { computeStats } from "../lib/stats";

interface Lang { lang: string; bytes: number; color: string | null }
/** Bytes -> sorted list with one-decimal percentages. */
export const withPct = (ls: Lang[]) => {
  const total = ls.reduce((s, l) => s + l.bytes, 0);
  return [...ls].sort((a, b) => b.bytes - a.bytes).map((l) => ({ ...l, pct: total ? Math.round((l.bytes / total) * 1000) / 10 : 0 }));
};

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET") return null;
  const db = env.DB, now = new Date();
  if (pathname === "/api/stats") {
    const iso = (ms: number) => new Date(ms).toISOString();
    const [days, active, totals, priv, jobs, exp] = (await db.batch([
      db.prepare("SELECT date, count FROM commits_daily WHERE date >= ? ORDER BY date ASC").bind(iso(+now - HEATMAP_DAYS * 864e5).slice(0, 10)),
      db.prepare("SELECT c.repo AS repo, p.name AS name, COUNT(*) AS commits FROM commits_recent c JOIN projects p ON p.repo = c.repo WHERE c.ts >= ? GROUP BY c.repo ORDER BY commits DESC, c.repo LIMIT 1").bind(iso(+now - 30 * 864e5)),
      db.prepare("SELECT COUNT(*) AS repos, COALESCE(SUM(commit_count), 0) AS commits, COALESCE(SUM(loc), 0) AS loc, MAX(updated_at) AS synced FROM projects"),
      db.prepare("SELECT repos, commit_count, loc FROM private_agg WHERE id = 1"),
      db.prepare("SELECT job, last_ok, last_err_code, last_err_at, alerted_at FROM jobs"),
      db.prepare("SELECT value FROM meta WHERE key='token_exp'"),
    ])) as { results: any[] }[];
    const t = totals.results[0] ?? {}, p = priv.results[0] ?? {};
    // Private totals are combined into the numbers and rounded so one sync can't be diffed to reveal a single private repo.
    const approx = (p.repos ?? 0) > 0 || (p.commit_count ?? 0) > 0 || (p.loc ?? 0) > 0;
    const [commits, loc] = [(t.commits ?? 0) + (p.commit_count ?? 0), (t.loc ?? 0) + (p.loc ?? 0)];
    const synced = t.synced ? new Date(t.synced) : null;
    return json({
      ...computeStats(days.results, now),
      // ponytail: counts the newest COMMITS_KEPT stored commits (public repos only), not a full 30-day history.
      mostActive30d: active.results[0] ?? null,
      totals: { repos: (t.repos ?? 0) + (p.repos ?? 0), commits: approx ? Math.round(commits / 10) * 10 : commits, loc: approx ? Math.round(loc / 1000) * 1000 : loc },
      syncedAt: synced && !isNaN(+synced) ? synced.toISOString() : null,
      approx,
      health: computeHealth(jobs.results as JobRow[], exp.results[0]?.value),
    }, 200, 60); // 60s, not 300: `health` (the stale banner) rides in this payload and is computed fresh on every cache miss
  }
  if (pathname === "/api/languages") {
    const [pub, priv] = (await db.batch([
      db.prepare("SELECT lang, SUM(bytes) AS bytes, MAX(color) AS color FROM languages GROUP BY lang"),
      db.prepare("SELECT lang, bytes, color FROM totals_private"),
    ])) as { results: Lang[] }[];
    const all = new Map<string, Lang>();
    for (const l of [...pub.results, ...priv.results]) all.set(l.lang, { lang: l.lang, bytes: (all.get(l.lang)?.bytes ?? 0) + l.bytes, color: all.get(l.lang)?.color ?? l.color });
    return json({ all: withPct([...all.values()]) }, 200, 300);
  }
  return null;
}
