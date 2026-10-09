import type { Env } from "../env";
import { parseDeps } from "../uptime";

const all = <T>(env: Env, sql: string, ...b: unknown[]) =>
  env.DB.prepare(sql).bind(...b).all<T>().then((r) => r.results);

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET" || pathname !== "/api/projects") return null;
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const [projects, agg, recent, ci, lh, api] = await Promise.all([
    all<{ repo: string; name: string; url: string; deps: string | null }>(env, "SELECT repo, name, url, deps FROM projects ORDER BY name"),
    all<{ project: string; n: number; up: number }>(env, "SELECT project, COUNT(*) AS n, SUM(ok) AS up FROM checks WHERE ts >= ? GROUP BY project", since),
    all<{ project: string; ok: number; ms: number | null }>(env,
      "SELECT project, ok, ms FROM (SELECT project, ok, ms, ts, ROW_NUMBER() OVER (PARTITION BY project ORDER BY ts DESC) AS rn FROM checks) WHERE rn <= 48 ORDER BY project, ts"),
    all<{ repo: string; status: string; conclusion: string | null; url: string }>(env, "SELECT repo, status, conclusion, url FROM ci"),
    all<{ project: string; week: string }>(env,
      "SELECT l.* FROM lighthouse l WHERE l.week = (SELECT MAX(week) FROM lighthouse WHERE project = l.project)"),
    all<{ url: string; name: string; indicator: string }>(env, "SELECT url, name, indicator FROM api_status"),
  ]);
  const by = <T extends object>(rows: T[], k: keyof T) => new Map(rows.map((r) => [r[k], r]));
  const aggBy = by(agg, "project"), ciBy = by(ci, "repo"), lhBy = by(lh, "project"), apiBy = by(api, "url");
  const hist = new Map<string, { ok: number; ms: number | null }[]>();
  for (const r of recent) (hist.get(r.project) ?? hist.set(r.project, []).get(r.project)!).push(r);

  const body = projects.map((p) => {
    const a = aggBy.get(p.repo), h = hist.get(p.repo) ?? [];
    const c = ciBy.get(p.repo), l = lhBy.get(p.repo) as Record<string, unknown> | undefined;
    return {
      repo: p.repo, name: p.name, url: p.url,
      up: h.length ? !!h[h.length - 1].ok : null,
      uptime30d: a?.n ? Math.round((a.up / a.n) * 1000) / 10 : null,
      latencyMs: h.filter((x) => x.ms != null).map((x) => x.ms as number),
      ci: c ? { status: c.status, conclusion: c.conclusion, url: c.url } : null,
      lighthouse: l ? { week: l.week, performance: l.performance, accessibility: l.accessibility, best_practices: l.best_practices, seo: l.seo } : null,
      deps: parseDeps(p.deps).map((u) => ({ url: u, name: apiBy.get(u)?.name ?? u, indicator: apiBy.get(u)?.indicator ?? "unknown" })),
    };
  });
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=60" } });
}
