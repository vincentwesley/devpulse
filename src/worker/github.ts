import type { Env } from "./env";
import { COMMITS_KEPT, COMMITS_PER_REPO, HEATMAP_DAYS, MAX_REPO_PAGES, MAX_REPOS, REPO_PAGE } from "./config";
import { mapCalendar, mapRepos, siteUrl, type CalendarResp, type GqlRepo, type ReposResp } from "./lib/github-parse";
import { TIMEOUT_MS } from "./lib/http";

export const API = "https://api.github.com";
export const ghHeaders = (env: Env) => ({ Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "devpulse" });

export async function gql<T>(env: Env, query: string, variables: object): Promise<T> {
  const r = await fetch(`${API}/graphql`, { method: "POST", headers: ghHeaders(env), body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`graphql ${r.status}`);
  const j = (await r.json()) as T & { errors?: unknown[] };
  if (Array.isArray(j.errors) && j.errors.length) throw new Error("graphql errors"); // partial data must never drive deletes
  return j;
}

export const TOPICS = "repositoryTopics(first:20){nodes{topic{name}}}";
const REPOS_QUERY = `query($after:String,$n:Int!){viewer{repositories(first:$n,after:$after,ownerAffiliations:OWNER,isFork:false,orderBy:{field:PUSHED_AT,direction:DESC}){pageInfo{hasNextPage endCursor} nodes{
nameWithOwner name isPrivate isArchived description homepageUrl ${TOPICS} stargazerCount forkCount createdAt pushedAt
primaryLanguage{name} languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}
latestRelease{tagName publishedAt} licenseInfo{spdxId name}
object(expression:"HEAD:.devpulse.json"){...on Blob{text}} readme:object(expression:"HEAD:README.md"){...on Blob{text}}
defaultBranchRef{target{...on Commit{statusCheckRollup{state} history(first:10){totalCount nodes{oid messageHeadline committedDate url author{name user{login}}}}}}}
}}}}`;
const CAL_QUERY = "query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}";

// Multi-row inserts stay under D1's 100 bound-parameter cap: <=10 languages x4, <=10 commits x6.
const rows = (n: number, w: number) => Array(n).fill(`(${Array(w).fill("?").join(",")})`).join(",");

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

  // Every selected repo gets updated_at=ts, so stale projects are `updated_at <> ts` (one bound param, however many repos).
  // Private repos: aggregates only (language bytes, repo + commit counts); nothing identifying is ever bound.
  await db.batch([
    ...repos.flatMap((r) => [
      db.prepare(
        "INSERT INTO projects (repo,name,url,topics,deps,description,language,stars,forks,created_at,pushed_at,release_tag,release_at,license,commit_count,ci_state,tagline,featured,cover_path,readme_excerpt,links_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) " +
        "ON CONFLICT(repo) DO UPDATE SET name=excluded.name,url=excluded.url,topics=excluded.topics,deps=excluded.deps,description=excluded.description,language=excluded.language,stars=excluded.stars,forks=excluded.forks,created_at=excluded.created_at,pushed_at=excluded.pushed_at,release_tag=excluded.release_tag,release_at=excluded.release_at,license=excluded.license,commit_count=excluded.commit_count,ci_state=excluded.ci_state,tagline=excluded.tagline,featured=excluded.featured,cover_path=excluded.cover_path,readme_excerpt=excluded.readme_excerpt,links_json=excluded.links_json,updated_at=excluded.updated_at",
      ).bind(r.full_name, r.name, siteUrl(r), JSON.stringify(r.topics), JSON.stringify(r.deps), r.description, r.language, r.stars, r.forks, r.created_at, r.pushed_at ?? null, r.release_tag, r.release_at, r.license, r.commit_count, r.ci_state, r.showcase.tagline, r.showcase.featured ? 1 : 0, r.showcase.image, r.readme, JSON.stringify(r.showcase.links), ts),
      db.prepare("DELETE FROM languages WHERE repo=?").bind(r.full_name),
      ...(r.langs.length ? [db.prepare(`INSERT INTO languages (repo,lang,bytes,color) VALUES ${rows(r.langs.length, 4)}`).bind(...r.langs.flatMap((l) => [r.full_name, l.lang, l.bytes, l.color]))] : []),
      ...(r.commits.length ? [db.prepare(`INSERT INTO commits_recent (repo,sha,message,author,ts,url) VALUES ${rows(r.commits.length, 6)} ON CONFLICT(sha) DO NOTHING`).bind(...r.commits.flatMap((c) => [c.repo, c.sha, c.message, c.author, c.ts, c.url]))] : []),
    ]),
    db.prepare("DELETE FROM projects WHERE updated_at <> ?").bind(ts),
    ...["ci", "commits_recent", "languages", "code_freq"].map((t) => db.prepare(`DELETE FROM ${t} WHERE repo NOT IN (SELECT repo FROM projects)`)),
    db.prepare("DELETE FROM commits_recent WHERE sha NOT IN (SELECT sha FROM commits_recent ORDER BY ts DESC LIMIT ?) AND sha NOT IN (SELECT sha FROM (SELECT sha, ROW_NUMBER() OVER (PARTITION BY repo ORDER BY ts DESC) AS rn FROM commits_recent) WHERE rn <= ?)").bind(COMMITS_KEPT, COMMITS_PER_REPO),
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
  if (now.getUTCHours() === 0 || empty) {
    try {
      const from = new Date(now.getTime() - HEATMAP_DAYS * 864e5).toISOString();
      const days = mapCalendar(await gql<CalendarResp>(env, CAL_QUERY, { login: env.GITHUB_OWNER, from, to: ts }));
      if (days.length) await db.batch(days.map((d) => db.prepare("INSERT INTO commits_daily (date,count) VALUES (?,?) ON CONFLICT(date) DO UPDATE SET count=excluded.count").bind(d.date, d.count)));
    } catch (e) { console.warn("heatmap sync failed", e); }
  }
}
