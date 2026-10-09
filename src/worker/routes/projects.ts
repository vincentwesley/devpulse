import type { Env } from "../env";
import { LATENCY_POINTS, UPTIME_DAYS } from "../config";
import { parseDeps } from "../lib/github-parse";
import { json } from "../lib/http";

type Rows<T> = { results: T[] };
const CACHE_SECONDS = 60;

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET" || pathname !== "/api/projects") return null;
  // Workers edge cache; absent (e.g. unit tests) -> skip.
  const cache = typeof caches === "undefined" ? undefined : (caches as unknown as { default: Cache }).default;
  const hit = await cache?.match(req.url);
  if (hit) return hit;

  const db = env.DB;
  const since = Math.floor(Date.now() / 1000) - UPTIME_DAYS * 86400;
  const { results: projects } = await db.prepare("SELECT repo, name, url, deps FROM projects ORDER BY name").all<{ repo: string; name: string; url: string; deps: string | null }>();
  // Per-project index lookups on checks(project, ts), never a table scan.
  const [ci, lh, api, ...rest] = (await db.batch([
    db.prepare("SELECT repo, status, conclusion, url FROM ci"),
    db.prepare("SELECT l.* FROM lighthouse l WHERE l.week = (SELECT MAX(week) FROM lighthouse WHERE project = l.project)"),
    db.prepare("SELECT url, name, indicator FROM api_status"),
    ...projects.map((p) => db.prepare("SELECT ok, ms FROM checks WHERE project = ? ORDER BY ts DESC LIMIT ?").bind(p.repo, LATENCY_POINTS)),
    ...projects.map((p) => db.prepare("SELECT COUNT(*) AS n, SUM(ok) AS up FROM checks WHERE project = ? AND ts >= ?").bind(p.repo, since)),
  ])) as Rows<any>[];
  const by = <T extends object>(r: Rows<T>, k: keyof T) => new Map(r.results.map((x) => [x[k], x]));
  const ciBy = by(ci, "repo"), lhBy = by(lh, "project"), apiBy = by(api, "url");

  const body = projects.map((p, i) => {
    const h = (rest[i].results as { ok: number; ms: number | null }[]).reverse(); // oldest first
    const a = rest[projects.length + i].results[0] as { n: number; up: number } | undefined;
    const c = ciBy.get(p.repo), l = lhBy.get(p.repo);
    return {
      repo: p.repo, name: p.name, url: p.url,
      up: h.length ? !!h[h.length - 1].ok : null,
      uptime30d: a?.n ? Math.round((a.up / a.n) * 1000) / 10 : null,
      latencyMs: h.filter((x) => x.ms != null).map((x) => x.ms as number),
      ci: c ? { status: c.status, conclusion: c.conclusion, url: c.url } : null,
      lighthouse: l ? { week: l.week, performance: l.performance, accessibility: l.accessibility, best_practices: l.best_practices, seo: l.seo } : null,
      deps: parseDeps(p.deps ?? "[]").map((u) => ({ url: u, name: apiBy.get(u)?.name ?? u, indicator: apiBy.get(u)?.indicator ?? "unknown" })),
    };
  });
  const res = json(body, 200, CACHE_SECONDS);
  await cache?.put(req.url, res.clone());
  return res;
}
