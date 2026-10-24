import type { Env } from "../env";
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
const latencyOf = (j: string): number[] => { try { const a = JSON.parse(j); return Array.isArray(a) ? a.filter((x) => typeof x === "number") : []; } catch { return []; } };
const topicsOf = (t: string | null): string[] => { try { const a = JSON.parse(t ?? "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; } };

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET" || pathname !== "/api/projects") return null;
  const db = env.DB;
  const { results: projects } = await db.prepare(
    "SELECT repo, name, url, deps, topics, description, language, stars, forks, created_at, pushed_at, release_tag, release_at, license, commit_count, loc, ci_state FROM projects ORDER BY name",
  ).all<P>();
  // Constant statement count (D1 free tier: 50 queries/invocation), however many projects there are.
  const [lh, api, langs, freq, upt] = (await db.batch([
    db.prepare("SELECT l.* FROM lighthouse l WHERE l.week = (SELECT MAX(week) FROM lighthouse WHERE project = l.project)"),
    db.prepare("SELECT url, name, indicator FROM api_status"),
    db.prepare("SELECT repo, lang, bytes, color FROM languages"),
    db.prepare("SELECT repo, week, \"add\" AS added, \"del\" AS removed FROM code_freq ORDER BY week"),
    db.prepare("SELECT project, up, uptime30d, latency_json FROM uptime_summary"), // maintained by the uptime cron; no checks scan here
  ])) as Rows<any>[];
  const by = <T extends object>(r: Rows<T>, k: keyof T) => new Map(r.results.map((x) => [x[k], x]));
  const group = <T extends { repo: string }>(r: Rows<T>) => r.results.reduce((m, x) => m.set(x.repo, [...(m.get(x.repo) ?? []), x]), new Map<string, T[]>());
  const lhBy = by(lh, "project"), apiBy = by(api, "url"), langBy = group<{ repo: string; lang: string; bytes: number; color: string | null }>(langs), freqBy = group<{ repo: string; week: number; added: number; removed: number }>(freq);
  const uptBy = by(upt, "project");
  const body = projects.map((p) => {
    const site = !!p.url;
    const a = site ? (uptBy.get(p.repo) as { up: number; uptime30d: number | null; latency_json: string } | undefined) : undefined;
    const l = site ? lhBy.get(p.repo) : undefined;
    return {
      repo: p.repo, name: p.name, url: p.url || null,
      up: a ? !!a.up : null,
      uptime30d: a?.uptime30d ?? null,
      latencyMs: a ? latencyOf(a.latency_json) : [],
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
  return json(body, 200, 300);
}
