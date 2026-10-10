// Pure GitHub response parsers (no I/O).
export interface Repo { full_name: string; name: string; homepage: string | null; topics?: string[]; private?: boolean; fork?: boolean; archived?: boolean; pushed_at?: string; default_branch: string }

const IGNORE = "devpulse-ignore";

export const isHttps = (u: string | null | undefined): boolean => {
  try { return new URL(u ?? "").protocol === "https:"; } catch { return false; }
};

/** Valid https homepage or null (= no site to monitor). */
export const siteUrl = (r: Repo): string | null => (isHttps(r.homepage?.trim()) ? r.homepage!.trim() : null);

/** Public, non-fork, non-archived, not `devpulse-ignore`; newest push first, capped at `max`. */
export const selectProjects = (repos: Repo[], max = Infinity): Repo[] =>
  repos
    .filter((r) => !r.private && !r.fork && !r.archived && !r.topics?.includes(IGNORE))
    .sort((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""))
    .slice(0, max);

/** Contents API file -> text. */
export const decodeContent = (f: { content?: string }): string => {
  const bin = atob((f.content ?? "").replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** `.devpulse.json` text (or the stored JSON array) -> valid dependency URLs (https only, max 10). Invalid -> []. */
export function parseDeps(text: string): string[] {
  try {
    const j = JSON.parse(text) as { deps?: unknown } | null;
    const d = Array.isArray(j) ? j : j?.deps;
    return Array.isArray(d) && d.length <= 10 && d.every((u) => typeof u === "string" && isHttps(u)) ? (d as string[]) : [];
  } catch { return []; }
}

export const mapRun = (j: { workflow_runs?: { status: string; conclusion: string | null; html_url: string; updated_at: string }[] }) => {
  const r = j.workflow_runs?.[0];
  return r ? { status: r.status, conclusion: r.conclusion, url: r.html_url, updated_at: r.updated_at } : null;
};

export interface GhCommit { sha: string; html_url: string; commit: { message: string; author: { name: string; date: string } }; author?: { login: string } | null }

export const mapCommits = (repo: string, list: GhCommit[]) =>
  list.map((c) => ({
    repo, sha: c.sha, message: c.commit.message.split("\n")[0], url: c.html_url,
    author: c.author?.login ?? c.commit.author.name, ts: c.commit.author.date,
  }));

export interface CalendarResp { data?: { user?: { contributionsCollection: { contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] } } } } }

export const mapCalendar = (j: CalendarResp): { date: string; count: number }[] =>
  (j.data?.user?.contributionsCollection.contributionCalendar.weeks ?? [])
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));
