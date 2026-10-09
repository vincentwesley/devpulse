// Pure GitHub response parsers (no I/O).
export interface Repo { full_name: string; name: string; homepage: string | null; topics?: string[]; private?: boolean; default_branch: string }

export const TOPIC = "devpulse";

export const isHttps = (u: string | null | undefined): boolean => {
  try { return new URL(u ?? "").protocol === "https:"; } catch { return false; }
};

export const selectProjects = (repos: Repo[]): Repo[] =>
  repos.filter((r) => !r.private && r.topics?.includes(TOPIC) && isHttps(r.homepage?.trim()));

/** Contents API file -> text. */
export const decodeContent = (f: { content?: string }): string => {
  const bin = atob((f.content ?? "").replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** `.devpulse.json` text -> valid dependency URLs (https only, max 10). Invalid -> []. */
export function parseDeps(text: string): string[] {
  try {
    const d = (JSON.parse(text) as { deps?: unknown }).deps;
    if (!Array.isArray(d) || d.length > 10) return [];
    const urls = d.map((u) => {
      if (typeof u !== "string") return null;
      try { return new URL(u).protocol === "https:" ? u : null; } catch { return null; }
    });
    return urls.every(Boolean) ? (urls as string[]) : [];
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
