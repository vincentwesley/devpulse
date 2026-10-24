// Pure GitHub response parsers (no I/O).
export interface Repo { full_name: string; name: string; homepage: string | null; topics?: string[]; private?: boolean; fork?: boolean; archived?: boolean; pushed_at?: string; default_branch?: string }

const IGNORE = "devpulse-ignore";
const MAX_DEPS_FILE = 8 * 1024;

export const isHttps = (u: string | null | undefined): boolean => {
  try { return new URL(u ?? "").protocol === "https:"; } catch { return false; }
};

/** Valid https homepage or null (= no site to monitor). */
export const siteUrl = (r: Repo): string | null => (isHttps(r.homepage?.trim()) ? r.homepage!.trim() : null);

/** Non-fork, non-archived, not `devpulse-ignore` (public or private). */
export const isEligible = (r: Pick<Repo, "fork" | "archived" | "topics">): boolean => !r.fork && !r.archived && !r.topics?.includes(IGNORE);

/** Public, eligible; newest push first, capped at `max`. */
export const selectProjects = (repos: Repo[], max = Infinity): Repo[] =>
  repos
    .filter((r) => !r.private && isEligible(r))
    .sort((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""))
    .slice(0, max);

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
  return text ? (text.length > EXCERPT ? text.slice(0, EXCERPT - 1).trimEnd() + "…" : text) : null;
}

// ---- GraphQL `viewer.repositories` -> public project rows + private aggregates ----

export interface GqlRepo {
  nameWithOwner: string; name: string; isPrivate: boolean; isArchived?: boolean;
  description?: string | null; homepageUrl?: string | null;
  repositoryTopics?: { nodes?: ({ topic: { name: string } } | null)[] } | null;
  stargazerCount?: number; forkCount?: number; createdAt?: string; pushedAt?: string | null;
  primaryLanguage?: { name: string } | null;
  languages?: { edges?: ({ size: number; node: { name: string; color?: string | null } } | null)[] } | null;
  latestRelease?: { tagName: string; publishedAt?: string | null } | null;
  licenseInfo?: { spdxId?: string | null; name?: string | null } | null;
  object?: { text?: string | null } | null;
  readme?: { text?: string | null } | null;
  defaultBranchRef?: { target?: {
    statusCheckRollup?: { state?: string } | null;
    history?: { totalCount?: number; nodes?: ({ oid: string; messageHeadline?: string; committedDate?: string; url?: string; author?: { name?: string | null; user?: { login?: string } | null } | null } | null)[] };
  } | null } | null;
}
export interface ReposResp { data?: { viewer?: { repositories: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (GqlRepo | null)[] } } } }

export interface Lang { lang: string; bytes: number; color: string | null }
export interface PubRepo extends Repo {
  description: string | null; language: string | null; stars: number; forks: number; created_at: string | null;
  release_tag: string | null; release_at: string | null; license: string | null; commit_count: number; ci_state: string | null;
  deps: string[]; langs: Lang[]; showcase: Showcase; readme: string | null;
  commits: { repo: string; sha: string; message: string; author: string; ts: string; url: string }[];
}
/** Everything kept about private repos: counts and language bytes. No name, URL or message. */
export interface PrivAgg { repos: number; commits: number; langs: Lang[] }

const langsOf = (n: GqlRepo): Lang[] =>
  (n.languages?.edges ?? []).flatMap((e) => (e ? [{ lang: e.node.name, bytes: e.size, color: e.node.color ?? null }] : []));

const toRepo = (n: GqlRepo): Repo => ({
  full_name: n.nameWithOwner, name: n.name, homepage: n.homepageUrl ?? null, private: n.isPrivate, archived: !!n.isArchived,
  topics: (n.repositoryTopics?.nodes ?? []).flatMap((t) => (t ? [t.topic.name] : [])), pushed_at: n.pushedAt ?? undefined,
});

function mapPublic(r: Repo, n: GqlRepo): PubRepo {
  const t = n.defaultBranchRef?.target;
  const text = n.object?.text;
  return {
    ...r,
    description: n.description?.trim() || null, language: n.primaryLanguage?.name ?? null,
    stars: n.stargazerCount ?? 0, forks: n.forkCount ?? 0, created_at: n.createdAt ?? null,
    release_tag: n.latestRelease?.tagName ?? null, release_at: n.latestRelease?.publishedAt ?? null,
    license: n.licenseInfo?.spdxId && n.licenseInfo.spdxId !== "NOASSERTION" ? n.licenseInfo.spdxId : n.licenseInfo?.name ?? null,
    commit_count: t?.history?.totalCount ?? 0, ci_state: t?.statusCheckRollup?.state ?? null,
    deps: text && text.length <= MAX_DEPS_FILE ? parseDeps(text) : [],
    langs: langsOf(n),
    showcase: text && text.length <= MAX_DEPS_FILE ? parseShowcase(text) : parseShowcase(""),
    readme: readmeExcerpt(n.readme?.text), // public repos only: mapPublic never runs for private ones
    commits: (t?.history?.nodes ?? []).flatMap((c) =>
      c ? [{ repo: n.nameWithOwner, sha: c.oid, message: (c.messageHeadline ?? "").split("\n")[0], url: c.url ?? "", author: c.author?.user?.login ?? c.author?.name ?? "unknown", ts: c.committedDate ?? "" }] : []),
  };
}

/** Split into public project rows (capped) and private aggregates; private details die here. */
export function mapRepos(nodes: GqlRepo[], max = Infinity): { pub: PubRepo[]; priv: PrivAgg } {
  const byName = new Map(nodes.map((n) => [n.nameWithOwner, n]));
  const repos = nodes.map(toRepo);
  const pub = selectProjects(repos, max).map((r) => mapPublic(r, byName.get(r.full_name)!));
  const bytes = new Map<string, Lang>();
  let count = 0, commits = 0;
  for (const r of repos) {
    if (!r.private || !isEligible(r)) continue;
    const n = byName.get(r.full_name)!;
    count++;
    commits += n.defaultBranchRef?.target?.history?.totalCount ?? 0;
    for (const l of langsOf(n)) bytes.set(l.lang, { lang: l.lang, bytes: (bytes.get(l.lang)?.bytes ?? 0) + l.bytes, color: bytes.get(l.lang)?.color ?? l.color });
  }
  return { pub, priv: { repos: count, commits, langs: [...bytes.values()] } };
}

export interface CalendarResp { data?: { user?: { contributionsCollection: { contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] } } } } }

export const mapCalendar = (j: CalendarResp): { date: string; count: number }[] =>
  (j.data?.user?.contributionsCollection.contributionCalendar.weeks ?? [])
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));
