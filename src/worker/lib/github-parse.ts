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
  deps: string[]; langs: Lang[];
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
