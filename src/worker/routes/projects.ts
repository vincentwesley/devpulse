import type { Env } from "../env";
import { MAX_SITES } from "../config";
import { gapsOf } from "../lib/audit";
import { parseDeps } from "../lib/github-parse";
import { json } from "../lib/http";
import { readShowcase } from "../lib/showcase-readme";
import { snippet } from "../lib/snippet";
import { stageOf, staleOf } from "../lib/stage";
import { withPct } from "./stats";

type Rows<T> = { results: T[] };
interface P {
  repo: string; name: string; url: string | null; deps: string | null; topics: string | null; description: string | null; language: string | null;
  stars: number | null; forks: number | null; created_at: string | null; pushed_at: string | null; release_tag: string | null; release_at: string | null;
  license: string | null; commit_count: number | null; loc: number | null; ci_state: string | null;
  tagline: string | null; featured: number | null; cover_path: string | null; readme_excerpt: string | null; links_json: string | null;
  archived: number | null; homepage: string | null; updated_at_gh: string | null; detail_at: string | null; url_source: string | null; readme_image: string | null;
  audit: string | null; sheet_id: string | null; kind: string | null; showcase_json: string | null;
}

/** statusCheckRollup state -> the {status, conclusion, url} chip shape the UI already renders. */
const ciOf = (repo: string, s: string | null) =>
  !s ? null : {
    status: s === "SUCCESS" || s === "FAILURE" || s === "ERROR" ? "completed" : "in_progress",
    conclusion: s === "SUCCESS" ? "success" : s === "FAILURE" || s === "ERROR" ? "failure" : null,
    url: `https://github.com/${repo}/actions`,
  };
const latencyOf = (j: string): number[] => { try { const a = JSON.parse(j); return Array.isArray(a) ? a.filter((x) => typeof x === "number") : []; } catch { return []; } };
const linksOf = (t: string | null): { label: string; url: string }[] => { try { const a = JSON.parse(t ?? "[]"); return Array.isArray(a) ? a.filter((x) => typeof x?.label === "string" && typeof x?.url === "string") : []; } catch { return []; } };
const topicsOf = (t: string | null): string[] => { try { const a = JSON.parse(t ?? "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; } };

/** 8-hex FNV-1a: a cache-busting tag, not security. */
export const tag = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return (h >>> 0).toString(16).padStart(8, "0"); };
const iso = (s: number | null | undefined) => (s == null ? null : new Date(s * 1000).toISOString());

/** Every public project with derived stage/freshness. Constant D1 statement count (free tier: 50 queries/invocation), however many projects there are. */
export async function loadProjects(env: Env, origin: string, now = Date.now()) {
  const db = env.DB;
  const [proj, lh, api, langs, freq, upt, inc, shots, meta] = (await db.batch([
    db.prepare(
      "SELECT repo, name, url, deps, topics, description, language, stars, forks, created_at, pushed_at, release_tag, release_at, license, commit_count, loc, ci_state, tagline, featured, cover_path, readme_excerpt, links_json, " +
      "archived, homepage, updated_at_gh, detail_at, url_source, readme_image, audit, sheet_id, kind, showcase_json FROM projects ORDER BY name",
    ),
    db.prepare("SELECT l.* FROM lighthouse l WHERE l.week = (SELECT MAX(week) FROM lighthouse WHERE project = l.project)"),
    db.prepare("SELECT url, name, indicator FROM api_status"),
    db.prepare("SELECT repo, lang, bytes, color FROM languages"),
    db.prepare("SELECT repo, week, \"add\" AS added, \"del\" AS removed FROM code_freq ORDER BY week"),
    db.prepare("SELECT project, up, uptime30d, latency_json, updated_at FROM uptime_summary"), // maintained by the uptime cron; no checks scan here
    db.prepare("SELECT DISTINCT project FROM incidents WHERE end_ts IS NULL"),
    db.prepare("SELECT repo, taken_at FROM shots WHERE bytes IS NOT NULL"),
    db.prepare("SELECT value FROM meta WHERE key='list_at'"),
  ])) as Rows<any>[];
  const by = <T extends object>(r: Rows<T>, k: keyof T) => new Map(r.results.map((x) => [x[k], x]));
  const group = <T extends { repo: string }>(r: Rows<T>) => r.results.reduce((m, x) => m.set(x.repo, [...(m.get(x.repo) ?? []), x]), new Map<string, T[]>());
  const lhBy = by(lh, "project"), apiBy = by(api, "url"), langBy = group<{ repo: string; lang: string; bytes: number; color: string | null }>(langs), freqBy = group<{ repo: string; week: number; added: number; removed: number }>(freq);
  const uptBy = by(upt, "project"), shotBy = by(shots, "repo"), open = new Set(inc.results.map((r: { project: string }) => r.project));
  const projects = proj.results as P[];
  const listAt: string | null = meta.results[0]?.value ?? null;
  const sitesPerCycle = Math.ceil(projects.filter((p) => p.url).length / MAX_SITES);
  return projects.map((p) => {
    const site = !!p.url;
    const a = site ? (uptBy.get(p.repo) as { up: number; uptime30d: number | null; latency_json: string; updated_at: number } | undefined) : undefined;
    const l = site ? lhBy.get(p.repo) : undefined;
    const topics = topicsOf(p.topics), shot = shotBy.get(p.repo) as { taken_at: number } | undefined;
    const up = a ? !!a.up : null;
    const cover = p.cover_path ?? p.readme_image;
    const fresh = staleOf({ listAt, url: p.url, uptimeAt: a?.updated_at ?? null, sitesPerCycle, pushedAt: p.pushed_at, updatedAt: p.updated_at_gh, detailAt: p.detail_at }, now);
    const sc = readShowcase(p.showcase_json), imgTag = tag(`${p.detail_at ?? ""}|${p.pushed_at ?? ""}`);
    return {
      repo: p.repo, name: p.name, url: p.url || null,
      up,
      uptime30d: a?.uptime30d ?? null,
      latencyMs: a ? latencyOf(a.latency_json) : [],
      ci: ciOf(p.repo, p.ci_state), ciState: p.ci_state,
      lighthouse: l ? { week: l.week, performance: l.performance, accessibility: l.accessibility, best_practices: l.best_practices, seo: l.seo } : null,
      deps: parseDeps(p.deps ?? "[]").map((u) => ({ url: u, name: apiBy.get(u)?.name ?? u, indicator: apiBy.get(u)?.indicator ?? "unknown" })),
      description: p.description, topics, language: p.language,
      stars: p.stars ?? 0, forks: p.forks ?? 0, createdAt: p.created_at, pushedAt: p.pushed_at,
      release: p.release_tag ? { tag: p.release_tag, at: p.release_at } : null,
      license: p.license, commitCount: p.commit_count, loc: p.loc,
      tagline: p.tagline ?? null, featured: !!p.featured, cover: cover ? `/img/${p.name}?v=${tag(cover + "|" + (p.pushed_at ?? ""))}` : null, readme: p.readme_excerpt ?? null, links: linksOf(p.links_json),
      languages: withPct((langBy.get(p.repo) ?? []).map(({ lang, bytes, color }) => ({ lang, bytes, color }))),
      codeFreq: (freqBy.get(p.repo) ?? []).map((f) => ({ week: f.week, add: f.added, del: f.removed })), // public repos only: private repos have no rows here
      // Round 5: hub fields.
      archived: !!p.archived,
      stage: stageOf({ archived: !!p.archived, url: p.url, up, incidentOpen: site && open.has(p.repo), topics, kind: p.kind, release: !!p.release_tag, pushedAt: p.pushed_at }, now),
      stale: fresh.stale, staleWhy: fresh.why,
      checkedAt: listAt, detailAt: p.detail_at, uptimeAt: iso(a?.updated_at), shotAt: iso(shot?.taken_at),
      urlSource: p.url ? p.url_source : null, sheetId: p.sheet_id,
      audit: gapsOf({ audit: p.audit, description: p.description, homepage: p.homepage, topics }),
      shot: shot ? `/shot/${p.name}.jpg?v=${shot.taken_at}` : null,
      snippet: snippet(origin, p.name, p.url),
      showcase: {
        summary: sc.summary, highlights: sc.highlights, runThrough: sc.runThrough,
        images: sc.images.map((x, i) => ({ url: `/img/${p.name}/${i}?v=${imgTag}`, alt: x.alt })),
      },
    };
  });
}
export type Project = Awaited<ReturnType<typeof loadProjects>>[number];

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET" || pathname !== "/api/projects") return null;
  return json(await loadProjects(env, new URL(req.url).origin), 200, 300);
}
