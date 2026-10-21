import type { Env } from "../env";
import { LATENCY_POINTS, UPTIME_DAYS } from "../config";
import { parseDeps } from "../lib/github-parse";
import { json } from "../lib/http";
import { withPct } from "./stats";

type Rows<T> = { results: T[] };
interface P {
  repo: string; name: string; url: string | null; deps: string | null; topics: string | null; description: string | null; language: string | null;
  stars: number | null; forks: number | null; created_at: string | null; pushed_at: string | null; release_tag: string | null; release_at: string | null;
  license: string | null; commit_count: number | null; loc: number | null; ci_state: string | null;
}

/** statusCheckRollup state -> the {status, conclusion, url} chip shape the UI already renders. */
const ciOf = (repo: string, s: string | null) =>
  !s ? null : {
    status: s === "SUCCESS" || s === "FAILURE" || s === "ERROR" ? "completed" : "in_progress",
    conclusion: s === "SUCCESS" ? "success" : s === "FAILURE" || s === "ERROR" ? "failure" : null,
    url: `https://github.com/${repo}/actions`,
  };
const topicsOf = (t: string | null): string[] => { try { const a = JSON.parse(t ?? "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; } };

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET" || pathname !== "/api/projects") return null;
  const db = env.DB;
  const since = Math.floor(Date.now() / 1000) - UPTIME_DAYS * 86400;
  const { results: projects } = await db.prepare(
    "SELECT repo, name, url, deps, topics, description, language, stars, forks, created_at, pushed_at, release_tag, release_at, license, commit_count, loc, ci_state FROM projects ORDER BY name",
  ).all<P>();
  // Per-project index lookups on checks(project, ts), never a table scan.
  const [lh, api, langs, freq, ...rest] = (await db.batch([
    db.prepare("SELECT l.* FROM lighthouse l WHERE l.week = (SELECT MAX(week) FROM lighthouse WHERE project = l.project)"),
    db.prepare("SELECT url, name, indicator FROM api_status"),
    db.prepare("SELECT repo, lang, bytes, color FROM languages"),
    db.prepare("SELECT repo, week, \"add\" AS added, \"del\" AS removed FROM code_freq ORDER BY week"),
    ...projects.map((p) => db.prepare("SELECT ok, ms FROM checks WHERE project = ? ORDER BY ts DESC LIMIT ?").bind(p.repo, LATENCY_POINTS)),
    ...projects.map((p) => db.prepare("SELECT COUNT(*) AS n, SUM(ok) AS up FROM checks WHERE project = ? AND ts >= ?").bind(p.repo, since)),
  ])) as Rows<any>[];
  const by = <T extends object>(r: Rows<T>, k: keyof T) => new Map(r.results.map((x) => [x[k], x]));
  const group = <T extends { repo: string }>(r: Rows<T>) => r.results.reduce((m, x) => m.set(x.repo, [...(m.get(x.repo) ?? []), x]), new Map<string, T[]>());
  const lhBy = by(lh, "project"), apiBy = by(api, "url"), langBy = group<{ repo: string; lang: string; bytes: number; color: string | null }>(langs), freqBy = group<{ repo: string; week: number; added: number; removed: number }>(freq);

  const body = projects.map((p, i) => {
    const site = !!p.url;
    const h = site ? (rest[i].results as { ok: number; ms: number | null }[]).reverse() : []; // oldest first
    const a = site ? (rest[projects.length + i].results[0] as { n: number; up: number } | undefined) : undefined;
    const l = site ? lhBy.get(p.repo) : undefined;
    return {
      repo: p.repo, name: p.name, url: p.url || null,
      up: h.length ? !!h[h.length - 1].ok : null,
      uptime30d: a?.n ? Math.round((a.up / a.n) * 1000) / 10 : null,
      latencyMs: h.filter((x) => x.ms != null).map((x) => x.ms as number),
      ci: ciOf(p.repo, p.ci_state), ciState: p.ci_state,
      lighthouse: l ? { week: l.week, performance: l.performance, accessibility: l.accessibility, best_practices: l.best_practices, seo: l.seo } : null,
      deps: parseDeps(p.deps ?? "[]").map((u) => ({ url: u, name: apiBy.get(u)?.name ?? u, indicator: apiBy.get(u)?.indicator ?? "unknown" })),
      description: p.description, topics: topicsOf(p.topics), language: p.language,
      stars: p.stars ?? 0, forks: p.forks ?? 0, createdAt: p.created_at, pushedAt: p.pushed_at,
      release: p.release_tag ? { tag: p.release_tag, at: p.release_at } : null,
      license: p.license, commitCount: p.commit_count, loc: p.loc,
      languages: withPct((langBy.get(p.repo) ?? []).map(({ lang, bytes, color }) => ({ lang, bytes, color }))),
      codeFreq: (freqBy.get(p.repo) ?? []).map((f) => ({ week: f.week, add: f.added, del: f.removed })), // public repos only: private repos have no rows here
    };
  });
  return json(body, 200, 60);
}
