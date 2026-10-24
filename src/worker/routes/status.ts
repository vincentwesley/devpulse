import type { Env } from "../env";
import { json } from "../lib/http";

const DAYS = 90;
const iso = (s: number | null) => (s == null ? null : new Date(s * 1000).toISOString());

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET" || pathname !== "/api/status") return null;
  const from = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
  const db = env.DB;
  const [sites, days, summary, inc] = (await db.batch([
    db.prepare("SELECT repo, name, url FROM projects WHERE url IS NOT NULL AND url <> '' ORDER BY name"),
    db.prepare("SELECT project, date, up, total FROM daily_uptime WHERE date >= ? ORDER BY project, date").bind(from),
    db.prepare("SELECT project, up FROM uptime_summary"),
    db.prepare("SELECT p.name AS name, i.start_ts AS start_ts, i.end_ts AS end_ts, i.status AS status FROM incidents i JOIN projects p ON p.repo = i.project ORDER BY i.start_ts DESC LIMIT 30"),
  ])) as { results: any[] }[];
  const dayBy = new Map<string, { date: string; up: number; total: number }[]>();
  for (const d of days.results) dayBy.set(d.project, [...(dayBy.get(d.project) ?? []), { date: d.date, up: d.up, total: d.total }]);
  const upBy = new Map<string, number>(summary.results.map((r) => [r.project, r.up]));
  return json({
    sites: sites.results.map((s) => {
      const ds = (dayBy.get(s.repo) ?? []).slice(-DAYS);
      const total = ds.reduce((n, d) => n + d.total, 0), up = ds.reduce((n, d) => n + d.up, 0);
      return { name: s.name, repo: s.repo, url: s.url, up: upBy.has(s.repo) ? !!upBy.get(s.repo) : null, uptime90d: total ? Math.round((up / total) * 1000) / 10 : null, days: ds };
    }),
    incidents: inc.results.map((i) => ({ name: i.name, start: iso(i.start_ts), end: iso(i.end_ts), status: i.status ?? null })),
  }, 200, 300);
}
