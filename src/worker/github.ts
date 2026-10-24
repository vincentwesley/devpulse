import type { Env } from "./env";
import { COMMITS_KEPT, COMMITS_PER_REPO, HEATMAP_DAYS, MAX_REPO_PAGES, MAX_REPOS, REPO_PAGE } from "./config";
import { mapCalendar, mapRepos, siteUrl, type CalendarResp, type GqlRepo, type ReposResp } from "./lib/github-parse";
import { TIMEOUT_MS } from "./lib/http";
import { JobError, noteExpiry } from "./lib/jobs";

export const API = "https://api.github.com";
export const ghHeaders = (env: Env) => ({ Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "devpulse" });

export async function gql<T>(env: Env, query: string, variables: object): Promise<T> {
  const r = await fetch(`${API}/graphql`, { method: "POST", headers: ghHeaders(env), body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new JobError(r.status === 401 ? "auth" : r.status === 403 || r.status === 429 ? "rate" : "http", `graphql ${r.status}`);
  noteExpiry(r);
  const j = (await r.json()) as T & { errors?: { type?: string }[] };
  if (Array.isArray(j.errors) && j.errors.length) throw new JobError(j.errors.some((e) => e?.type === "RATE_LIMITED") ? "rate" : "parse", "graphql errors"); // partial data must never drive deletes
  return j;
}

export const TOPICS = "repositoryTopics(first:20){nodes{topic{name}}}";
const REPOS_QUERY = `query($after:String,$n:Int!){viewer{repositories(first:$n,after:$after,ownerAffiliations:OWNER,isFork:false,orderBy:{field:PUSHED_AT,direction:DESC}){pageInfo{hasNextPage endCursor} nodes{
id nameWithOwner name isPrivate isArchived updatedAt description homepageUrl ${TOPICS} stargazerCount forkCount createdAt pushedAt
primaryLanguage{name} languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}
latestRelease{tagName publishedAt} licenseInfo{spdxId name}
object(expression:"HEAD:.devpulse.json"){...on Blob{text}} readme:object(expression:"HEAD:README.md"){...on Blob{text}}
defaultBranchRef{target{...on Commit{statusCheckRollup{state} history(first:10){totalCount nodes{oid messageHeadline committedDate url author{name user{login}}}}}}}
}}}}`;
// Change check: same ordering and fields the fingerprint needs, none of the heavy ones (languages, README, history).
const CHECK_REPOS = 100; // ponytail: fingerprint covers the 100 most recently pushed repos; the hourly full sync is the safety net for the rest
const CHECK_QUERY = `query{viewer{repositories(first:${CHECK_REPOS},ownerAffiliations:OWNER,isFork:false,orderBy:{field:PUSHED_AT,direction:DESC}){nodes{id nameWithOwner pushedAt updatedAt isPrivate isArchived defaultBranchRef{target{...on Commit{statusCheckRollup{state}}}}}}}}`;
const CAL_QUERY = "query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}";

// Multi-row inserts stay under D1's 100 bound-parameter cap: <=10 languages x4, <=10 commits x6.
const rows = (n: number, w: number) => Array(n).fill(`(${Array(w).fill("?").join(",")})`).join(",");

/** SHA-256 over the fields that make a full sync worthwhile. Stored as a hash only, so no private repo name is persisted. */
export async function fingerprint(nodes: (GqlRepo | null)[]): Promise<string> {
  const text = nodes.filter((n): n is GqlRepo => !!n).slice(0, CHECK_REPOS)
    .map((n) => [n.id, n.nameWithOwner, n.pushedAt, n.updatedAt, n.isPrivate, n.isArchived, n.defaultBranchRef?.target?.statusCheckRollup?.state].join("|")).join("\n");
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Every 15 min: hourly slots run the full sync; the others run one small query and sync only when the fingerprint moved.
 * Slots: check = 1 fetch + 1 D1 read; changed = + the full sync (<= MAX_REPO_PAGES + 1 fetches).
 */
export async function githubTick(env: Env, now: Date, hourly: boolean): Promise<void> {
  if (!env.GITHUB_TOKEN) throw new JobError("auth", "GITHUB_TOKEN missing");
  if (!hourly) {
    const nodes = (await gql<ReposResp>(env, CHECK_QUERY, {})).data?.viewer?.repositories.nodes;
    if (!nodes) throw new JobError("parse", "graphql check: no data");
    const stored = await env.DB.prepare("SELECT value FROM meta WHERE key='fp'").first<{ value: string }>();
    if (stored?.value === (await fingerprint(nodes))) return;
  }
  await syncGithub(env, now);
}

const RENAMED: (readonly [string, string])[] = [...["projects", "languages", "code_freq", "commits_recent", "ci"].map((t) => [t, "repo"] as const),
  ...["uptime_summary", "daily_uptime", "incidents", "checks", "lighthouse"].map((t) => [t, "project"] as const)];

export async function syncGithub(env: Env, now = new Date()): Promise<void> {
  if (!env.GITHUB_TOKEN) return console.warn("GITHUB_TOKEN missing, skipping GitHub sync");
  const db = env.DB;

  // (1) one GraphQL query per page (<= MAX_REPO_PAGES). Any failure throws before a single write, so a bad sync never deletes data.
  const nodes: GqlRepo[] = [];
  let after: string | null = null, more = false;
  for (let i = 0; i < MAX_REPO_PAGES; i++) {
    const conn: NonNullable<NonNullable<ReposResp["data"]>["viewer"]>["repositories"] | undefined = (await gql<ReposResp>(env, REPOS_QUERY, { after, n: REPO_PAGE })).data?.viewer?.repositories;
    if (!conn) throw new Error("graphql repositories: no data");
    nodes.push(...conn.nodes.filter((n): n is GqlRepo => !!n));
    more = conn.pageInfo.hasNextPage;
    if (!more) break;
    after = conn.pageInfo.endCursor;
  }
  const { pub: repos, priv } = mapRepos(nodes, MAX_REPOS);
  if (repos.length === MAX_REPOS) console.warn(`syncing the ${MAX_REPOS} most recently pushed public repos`);
  if (more) console.warn(`repo list truncated at ${nodes.length} repos, keeping previous private aggregates`);
  const ts = now.toISOString();

  // Wipe guard: an empty or less-than-half result while rows exist is a bad response, never a mass delete.
  const prev = (await db.prepare("SELECT repo, repo_id FROM projects").all<{ repo: string; repo_id: string | null }>()).results;
  if (prev.length && repos.length * 2 < prev.length) throw new JobError("parse", `sync returned ${repos.length} of ${prev.length} repos, refusing to delete`);
  // Rename: same permanent id under a new name. Re-key every table in this batch (OR IGNORE: a PK clash leaves the old row for orphan cleanup).
  const idToRepo = new Map(prev.flatMap((p) => (p.repo_id ? [[p.repo_id, p.repo] as const] : [])));
  const renames = repos.flatMap((r) => { const old = r.repo_id ? idToRepo.get(r.repo_id) : undefined; return old && old !== r.full_name ? [{ old, to: r.full_name, name: r.name }] : []; });
  const bare = (full: string) => full.split("/").pop()!;

  // Every selected repo gets updated_at=ts, so stale projects are `updated_at <> ts` (one bound param, however many repos).
  // Private repos: aggregates only (language bytes, repo + commit counts); nothing identifying is ever bound.
  await db.batch([
    ...renames.flatMap((x) => [
      ...RENAMED.map(([t, col]) => db.prepare(`UPDATE OR IGNORE ${t} SET ${col}=? WHERE ${col}=?`).bind(x.to, x.old)),
      db.prepare("UPDATE repo_alias SET repo=? WHERE repo=?").bind(x.to, x.old), // chains: a -> b -> c
      db.prepare("DELETE FROM repo_alias WHERE old_name=?").bind(x.name), // renamed back
      // Case-only renames need no alias: lookups are case-insensitive.
      ...(bare(x.old).toLowerCase() === x.name.toLowerCase() ? [] : [db.prepare("INSERT INTO repo_alias (old_name,repo) VALUES (?,?) ON CONFLICT(old_name) DO UPDATE SET repo=excluded.repo").bind(bare(x.old), x.to)]),
    ]),
    ...repos.flatMap((r) => [
      db.prepare(
        "INSERT INTO projects (repo,name,url,topics,deps,description,language,stars,forks,created_at,pushed_at,release_tag,release_at,license,commit_count,ci_state,tagline,featured,cover_path,readme_excerpt,links_json,updated_at,repo_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) " +
        "ON CONFLICT(repo) DO UPDATE SET name=excluded.name,url=excluded.url,topics=excluded.topics,deps=excluded.deps,description=excluded.description,language=excluded.language,stars=excluded.stars,forks=excluded.forks,created_at=excluded.created_at,pushed_at=excluded.pushed_at,release_tag=excluded.release_tag,release_at=excluded.release_at,license=excluded.license,commit_count=excluded.commit_count,ci_state=excluded.ci_state,tagline=excluded.tagline,featured=excluded.featured,cover_path=excluded.cover_path,readme_excerpt=excluded.readme_excerpt,links_json=excluded.links_json,updated_at=excluded.updated_at,repo_id=excluded.repo_id",
      ).bind(r.full_name, r.name, siteUrl(r), JSON.stringify(r.topics), JSON.stringify(r.deps), r.description, r.language, r.stars, r.forks, r.created_at, r.pushed_at ?? null, r.release_tag, r.release_at, r.license, r.commit_count, r.ci_state, r.showcase.tagline, r.showcase.featured ? 1 : 0, r.showcase.image, r.readme, JSON.stringify(r.showcase.links), ts, r.repo_id),
      db.prepare("DELETE FROM languages WHERE repo=?").bind(r.full_name),
      ...(r.langs.length ? [db.prepare(`INSERT INTO languages (repo,lang,bytes,color) VALUES ${rows(r.langs.length, 4)}`).bind(...r.langs.flatMap((l) => [r.full_name, l.lang, l.bytes, l.color]))] : []),
      ...(r.commits.length ? [db.prepare(`INSERT INTO commits_recent (repo,sha,message,author,ts,url) VALUES ${rows(r.commits.length, 6)} ON CONFLICT(sha) DO UPDATE SET repo=excluded.repo WHERE repo NOT IN (SELECT repo FROM projects)`).bind(...r.commits.flatMap((c) => [c.repo, c.sha, c.message, c.author, c.ts, c.url]))] : []),
    ]),
    db.prepare("DELETE FROM projects WHERE updated_at <> ?").bind(ts),
    ...["ci", "commits_recent", "languages", "code_freq"].map((t) => db.prepare(`DELETE FROM ${t} WHERE repo NOT IN (SELECT repo FROM projects)`)),
    db.prepare("DELETE FROM commits_recent WHERE sha NOT IN (SELECT sha FROM commits_recent ORDER BY ts DESC LIMIT ?) AND sha NOT IN (SELECT sha FROM (SELECT sha, ROW_NUMBER() OVER (PARTITION BY repo ORDER BY ts DESC) AS rn FROM commits_recent) WHERE rn <= ?)").bind(COMMITS_KEPT, COMMITS_PER_REPO),
    db.prepare("INSERT INTO meta (key,value) VALUES ('fp',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(await fingerprint(nodes)),
    // Truncated list = incomplete private totals: keep the previous ones.
    ...(more ? [] : [
      db.prepare("DELETE FROM totals_private"),
      ...priv.langs.map((l) => db.prepare("INSERT INTO totals_private (lang,bytes,color) VALUES (?,?,?)").bind(l.lang, l.bytes, l.color)),
      // loc is owned by the daily code_frequency slot; this only refreshes counts.
      db.prepare("INSERT INTO private_agg (id,repos,commit_count) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET repos=excluded.repos,commit_count=excluded.commit_count").bind(priv.repos, priv.commits),
    ]),
  ]);

  // (2) heatmap: daily at 00 UTC or when empty
  const empty = !(await db.prepare("SELECT COUNT(*) AS n FROM commits_daily").first<{ n: number }>())?.n;
  if ((now.getUTCHours() === 0 && now.getUTCMinutes() === 0) || empty) {
    try {
      const from = new Date(now.getTime() - HEATMAP_DAYS * 864e5).toISOString();
      const days = mapCalendar(await gql<CalendarResp>(env, CAL_QUERY, { login: env.GITHUB_OWNER, from, to: ts }));
      if (days.length) await db.batch(days.map((d) => db.prepare("INSERT INTO commits_daily (date,count) VALUES (?,?) ON CONFLICT(date) DO UPDATE SET count=excluded.count").bind(d.date, d.count)));
    } catch (e) { console.warn("heatmap sync failed", e); }
  }
}
