// Pure GitHub response parsers (no I/O).
import { readmeGaps } from "./audit";
import { parseReadmeShowcase, type ReadmeShowcase } from "./showcase-readme";
import { cleanUrl, siteCandidates, type Cand } from "./site";

export interface Repo { full_name: string; name: string; homepage: string | null; topics?: string[]; private?: boolean; fork?: boolean; archived?: boolean; pushed_at?: string; default_branch?: string }

const IGNORE = "devpulse-ignore";
const MAX_DEPS_FILE = 8 * 1024;

export const isHttps = (u: string | null | undefined): boolean => {
  try { return new URL(u ?? "").protocol === "https:"; } catch { return false; }
};

/** Non-fork, non-archived, not `devpulse-ignore` (public or private). */
export const isEligible = (r: Pick<Repo, "fork" | "archived" | "topics">): boolean => !r.fork && !r.archived && !r.topics?.includes(IGNORE);

/** `.devpulse.json` text (or the stored JSON array) -> valid dependency URLs (https only, max 10). Invalid -> []. */
export function parseDeps(text: string): string[] {
  try {
    const j = JSON.parse(text) as { deps?: unknown } | null;
    const d = Array.isArray(j) ? j : j?.deps;
    return Array.isArray(d) && d.length <= 10 && d.every((u) => typeof u === "string" && isHttps(u)) ? (d as string[]) : [];
  } catch { return []; }
}

export interface Showcase { featured: boolean; tagline: string | null; image: string | null; links: { label: string; url: string }[] }
const IMAGE = /^[A-Za-z0-9._/-]{1,200}\.(png|jpe?g|webp|gif)$/;
// eslint-disable-next-line no-control-regex
const CTRL = /[\x00-\x1F\x7F]/;
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && v.trim().length <= max && !CTRL.test(v.trim()) ? v.trim() : null);

/** `.devpulse.json` `showcase` block. Strict: every invalid field is dropped, never coerced. */
export function parseShowcase(text: string): Showcase {
  const out: Showcase = { featured: false, tagline: null, image: null, links: [] };
  try {
    const s = (JSON.parse(text) as { showcase?: Record<string, unknown> } | null)?.showcase;
    if (!s || typeof s !== "object" || Array.isArray(s)) return out;
    out.featured = s.featured === true;
    out.tagline = str(s.tagline, 140);
    const img = typeof s.image === "string" ? s.image : "";
    if (IMAGE.test(img) && !img.startsWith("/") && !img.split("/").some((p) => p === ".." || p === ".")) out.image = img;
    if (Array.isArray(s.links) && s.links.length <= 5)
      out.links = s.links.flatMap((l: { label?: unknown; url?: unknown } | null) => {
        const label = str(l?.label, 30), url = typeof l?.url === "string" ? l.url.trim() : "";
        if (!label || url.length > 300 || !isHttps(url) || CTRL.test(url)) return [];
        const u = new URL(url);
        return u.username || u.password ? [] : [{ label, url }];
      });
  } catch { /* invalid JSON -> defaults */ }
  return out;
}

const MAX_README = 8 * 1024, EXCERPT = 1200, BULLETS = 6, PARAS = 2;
/** README markdown -> plain-text excerpt (<=1200 chars): first paragraphs + up to 6 bullets, no markup, badges, images, HTML or code. Null if nothing usable. */
export function readmeExcerpt(md: string | null | undefined): string | null {
  if (!md) return null;
  const lines = md.slice(0, MAX_README).replace(/<!--[\s\S]*?-->/g, "\n").replace(/<[^>]*>/g, "").split(/\r?\n/);
  const blocks: string[] = [];
  let para: string[] = [], paras = 0, bullets = 0, fence: string | null = null;
  const flush = () => { if (para.length) { if (paras < PARAS) { blocks.push(para.join(" ")); paras++; } para = []; } };
  for (const raw of lines) {
    const f = /^\s*(```|~~~)/.exec(raw)?.[1];
    if (f) { fence = fence ? (fence === f ? null : fence) : f; flush(); continue; }
    if (fence) continue;
    let l = raw.trim();
    if (!l) { flush(); continue; }
    if (/^(#{1,6}\s|[=-]{3,}$|[*_]{3,}$|\||\[[^\]]+\]:\s)/.test(l)) { flush(); continue; }
    l = l.replace(/^>\s?/, "").replace(/!\[[^\]]*\]\([^)]*\)|!\[[^\]]*\]\[[^\]]*\]/g, "");
    l = l.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1");
    l = l.replace(/[`~]+|\*\*|__|(^|\s)[*_]+(?=\S)|(?<=\S)[*_]+(?=\s|$)/g, "$1").replace(/\s+/g, " ").trim();
    if (!l || /^[\s\p{P}\p{S}]*$/u.test(l)) continue; // emptied by stripping (badge/image-only line)
    const b = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(raw.trim().replace(/^>\s?/, ""));
    if (b) { flush(); if (bullets < BULLETS) { blocks.push("- " + l.replace(/^(?:[-*+]|\d+[.)])\s+/, "")); bullets++; } continue; }
    para.push(l);
  }
  flush();
  // Document order; bullets stay on adjacent lines, everything else is blank-line separated.
  const text = blocks.reduce((a, b, i) => a + (i ? (b.startsWith("- ") && blocks[i - 1].startsWith("- ") ? "\n" : "\n\n") : "") + b, "");
  const out = text.replace(/[\x00-\x08\x0B-\x1F\x7F\u202A-\u202E\u2066-\u2069]/g, "").trim();
  return out ? (out.length > EXCERPT ? out.slice(0, EXCERPT - 1).trimEnd() + "…" : out) : null;
}

// ---- GraphQL list pass (`viewer.repositories`, light fields) -> public rows + private aggregates ----

export interface GqlRepo {
  id?: string; updatedAt?: string; nameWithOwner: string; name: string; isPrivate: boolean; isArchived?: boolean;
  description?: string | null; homepageUrl?: string | null;
  repositoryTopics?: { nodes?: ({ topic: { name: string } } | null)[] } | null;
  stargazerCount?: number; forkCount?: number; createdAt?: string; pushedAt?: string | null;
  primaryLanguage?: { name: string } | null;
  languages?: { edges?: ({ size: number; node: { name: string; color?: string | null } } | null)[] } | null;
  latestRelease?: { tagName: string; publishedAt?: string | null } | null;
  licenseInfo?: { spdxId?: string | null; name?: string | null } | null;
  defaultBranchRef?: { target?: { statusCheckRollup?: { state?: string } | null; history?: { totalCount?: number } } | null } | null;
}
export interface ReposResp { data?: { viewer?: { repositories: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (GqlRepo | null)[] } } } }

export interface Lang { lang: string; bytes: number; color: string | null }
/** One public repo as the list pass sees it. Archived repos are kept (stage `archived`). */
export interface LightRepo {
  full_name: string; name: string; repo_id: string | null; archived: boolean; homepage: string | null; description: string | null; topics: string[];
  language: string | null; stars: number; forks: number; created_at: string | null; pushed_at: string | null; updated_at_gh: string | null;
  release_tag: string | null; release_at: string | null; license: string | null; commit_count: number; ci_state: string | null; langs: Lang[];
}
/** Everything kept about private repos: counts and language bytes. No name, URL or message. */
export interface PrivAgg { repos: number; commits: number; langs: Lang[] }

const langsOf = (n: GqlRepo): Lang[] =>
  (n.languages?.edges ?? []).flatMap((e) => (e ? [{ lang: e.node.name, bytes: e.size, color: e.node.color ?? null }] : []));
const topicsOf = (n: GqlRepo) => (n.repositoryTopics?.nodes ?? []).flatMap((t) => (t ? [t.topic.name] : []));

function mapLight(n: GqlRepo): LightRepo {
  const t = n.defaultBranchRef?.target;
  return {
    full_name: n.nameWithOwner, name: n.name, repo_id: n.id ?? null, archived: !!n.isArchived, homepage: n.homepageUrl?.trim() || null,
    description: n.description?.trim() || null, topics: topicsOf(n), language: n.primaryLanguage?.name ?? null,
    stars: n.stargazerCount ?? 0, forks: n.forkCount ?? 0, created_at: n.createdAt ?? null, pushed_at: n.pushedAt ?? null, updated_at_gh: n.updatedAt ?? null,
    release_tag: n.latestRelease?.tagName ?? null, release_at: n.latestRelease?.publishedAt ?? null,
    license: n.licenseInfo?.spdxId && n.licenseInfo.spdxId !== "NOASSERTION" ? n.licenseInfo.spdxId : n.licenseInfo?.name ?? null,
    commit_count: t?.history?.totalCount ?? 0, ci_state: t?.statusCheckRollup?.state ?? null, langs: langsOf(n),
  };
}

/** Split the list into public rows (every non-fork, non-ignored public repo, archived included; newest push first) and private aggregates; private details die here. */
export function mapList(nodes: GqlRepo[]): { pub: LightRepo[]; priv: PrivAgg } {
  const pub = nodes.filter((n) => !n.isPrivate && !topicsOf(n).includes(IGNORE)).map(mapLight).sort((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""));
  const bytes = new Map<string, Lang>();
  let count = 0, commits = 0;
  for (const n of nodes) {
    if (!n.isPrivate || !isEligible({ archived: n.isArchived, topics: topicsOf(n) })) continue;
    count++;
    commits += n.defaultBranchRef?.target?.history?.totalCount ?? 0;
    for (const l of langsOf(n)) bytes.set(l.lang, { lang: l.lang, bytes: (bytes.get(l.lang)?.bytes ?? 0) + l.bytes, color: bytes.get(l.lang)?.color ?? l.color });
  }
  return { pub, priv: { repos: count, commits, langs: [...bytes.values()].sort((a, b) => b.bytes - a.bytes || a.lang.localeCompare(b.lang)) } };
}

// ---- GraphQL detail pass (`nodes(ids:)`, public repos only) ----

const blob = { text: "" } as { text?: string | null } | null;
export interface GqlDetail {
  id: string; nameWithOwner: string; isPrivate?: boolean;
  object?: typeof blob; readme?: typeof blob; pkg?: typeof blob; wjsonc?: typeof blob; wjson?: typeof blob; wtoml?: typeof blob; manifest?: typeof blob;
  defaultBranchRef?: { target?: { history?: { nodes?: ({ oid: string; messageHeadline?: string; committedDate?: string; url?: string; author?: { name?: string | null; user?: { login?: string } | null } | null } | null)[] } } | null } | null;
}

/** `.devpulse.json` hub fields: live-site override, sheet row id, project kind. Strict: invalid -> null. */
export function parseHubMeta(text: string | null | undefined): { site: string | null; sheetId: string | null; kind: "extension" | null } {
  const out = { site: null as string | null, sheetId: null as string | null, kind: null as "extension" | null };
  try {
    const j = JSON.parse(text ?? "null") as Record<string, unknown> | null;
    if (!j || typeof j !== "object" || Array.isArray(j)) return out;
    out.site = cleanUrl(j.site);
    out.sheetId = typeof j.sheetId === "string" && /^[A-Z0-9]{2,5}-\d{2,3}$/.test(j.sheetId) ? j.sheetId : null;
    out.kind = j.kind === "extension" ? "extension" : null;
  } catch {}
  return out;
}

/** Root manifest.json declares a WebExtension. */
export const isManifest = (t: string | null | undefined) => { try { return Number.isInteger((JSON.parse(t ?? "null") as { manifest_version?: unknown } | null)?.manifest_version); } catch { return false; } };

const small = (b: { text?: string | null } | null | undefined) => (b?.text && b.text.length <= MAX_DEPS_FILE ? b.text : null);
export const README_PARSE_MAX = 32 * 1024;

export interface DetailRow {
  repo: string; deps: string[]; showcase: Showcase; readme: string | null; site_cands: Cand[]; sheet_id: string | null; kind: string | null;
  readme_image: string | null; audit: string[]; showcase_json: ReadmeShowcase;
  commits: { repo: string; sha: string; message: string; author: string; ts: string; url: string }[];
}

export function mapDetail(n: GqlDetail, owner: string, workersSub?: string): DetailRow {
  const text = small(n.object), md = n.readme?.text ? n.readme.text.slice(0, README_PARSE_MAX) : null;
  const meta = parseHubMeta(text), sc = parseReadmeShowcase(md);
  const name = n.nameWithOwner.split("/").pop()!;
  return {
    repo: n.nameWithOwner,
    deps: text ? parseDeps(text) : [],
    showcase: parseShowcase(text ?? ""),
    readme: readmeExcerpt(md), // public repos only: the detail pass never runs for private ones
    site_cands: siteCandidates({ owner, name, devpulseSite: meta.site, pkg: small(n.pkg), wranglerJsonc: small(n.wjsonc), wranglerJson: small(n.wjson), wranglerToml: small(n.wtoml), readme: md, workersSub }),
    sheet_id: meta.sheetId,
    kind: meta.kind ?? (isManifest(small(n.manifest)) ? "extension" : null),
    readme_image: sc.images[0]?.path ?? null,
    audit: readmeGaps(md),
    showcase_json: sc,
    commits: (n.defaultBranchRef?.target?.history?.nodes ?? []).flatMap((c) =>
      c ? [{ repo: n.nameWithOwner, sha: c.oid, message: (c.messageHeadline ?? "").split("\n")[0], url: c.url ?? "", author: c.author?.user?.login ?? c.author?.name ?? "unknown", ts: c.committedDate ?? "" }] : []),
  };
}

export interface CalendarResp { data?: { user?: { contributionsCollection: { contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] } } } } }

export const mapCalendar = (j: CalendarResp): { date: string; count: number }[] =>
  (j.data?.user?.contributionsCollection.contributionCalendar.weeks ?? [])
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));
