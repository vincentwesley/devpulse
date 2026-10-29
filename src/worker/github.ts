import type { Env } from "./env";
import { COMMITS_KEPT, COMMITS_PER_REPO, DETAIL_BATCH, DETAIL_CALLS, DETAIL_MIN_GAP_S, HEATMAP_DAYS, LIST_PAGE, MAX_LIST_PAGES } from "./config";
import { mapCalendar, mapDetail, mapList, type CalendarResp, type DetailRow, type GqlDetail, type GqlRepo, type ReposResp } from "./lib/github-parse";
import { websiteUrl } from "./lib/site";
import { TIMEOUT_MS } from "./lib/http";
import { JobError, noteExpiry } from "./lib/jobs";

export const API = "https://api.github.com";
export const ghHeaders = (env: Env) => ({ Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "devpulse" });

export async function gql<T>(env: Env, query: string, variables: object, allowNotFound = false): Promise<T> {
  const r = await fetch(`${API}/graphql`, { method: "POST", headers: ghHeaders(env), body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new JobError(r.status === 401 ? "auth" : r.status === 403 || r.status === 429 ? "rate" : "http", `graphql ${r.status}`);
  noteExpiry(r);
  const j = (await r.json()) as T & { errors?: { type?: string }[] };
  // partial data must never drive deletes; the detail pass alone may skip ids that vanished (NOT_FOUND) since it only updates rows
  if (Array.isArray(j.errors) && j.errors.length && !(allowNotFound && j.errors.every((e) => e?.type === "NOT_FOUND"))) throw new JobError(j.errors.some((e) => e?.type === "RATE_LIMITED") ? "rate" : "parse", "graphql errors");
  return j;
}

export const TOPICS = "repositoryTopics(first:20){nodes{topic{name}}}";
// List pass: light fields only (no blobs, no commit nodes); enough for status, private aggregates and change detection.
const LIST_QUERY = `query($after:String,$n:Int!){viewer{repositories(first:$n,after:$after,ownerAffiliations:OWNER,isFork:false,orderBy:{field:PUSHED_AT,direction:DESC}){pageInfo{hasNextPage endCursor} nodes{
id nameWithOwner name isPrivate isArchived updatedAt createdAt pushedAt description homepageUrl ${TOPICS} stargazerCount forkCount
primaryLanguage{name} languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}
latestRelease{tagName publishedAt} licenseInfo{spdxId name}
defaultBranchRef{target{...on Commit{statusCheckRollup{state} history(first:1){totalCount}}}}
}}}}`;
const B = "{...on Blob{text}}";
// Detail pass: public repos that changed (README, configs, recent commits).
const DETAIL_QUERY = `query($ids:[ID!]!){nodes(ids:$ids){...on Repository{id nameWithOwner isPrivate
object(expression:"HEAD:.devpulse.json")${B} readme:object(expression:"HEAD:README.md")${B} pkg:object(expression:"HEAD:package.json")${B}
wjsonc:object(expression:"HEAD:wrangler.jsonc")${B} wjson:object(expression:"HEAD:wrangler.json")${B} wtoml:object(expression:"HEAD:wrangler.toml")${B} manifest:object(expression:"HEAD:manifest.json")${B}
defaultBranchRef{target{...on Commit{history(first:10){nodes{oid messageHeadline committedDate url author{name user{login}}}}}}}
}}}`;
const CAL_QUERY = "query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}";

// Multi-row inserts stay under D1's 100 bound-parameter cap: <=10 languages x4, <=10 commits x6.
const rows = (n: number, w: number) => Array(n).fill(`(${Array(w).fill("?").join(",")})`).join(",");
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
/** ISO to the second: compares cleanly with GitHub's timestamps. */
const isoS = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const setMeta = (db: D1Database, k: string, v: string) => db.prepare("INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k, v);

/** Every slot: list pass (every repo, <= MAX_LIST_PAGES calls) then detail pass (<= DETAIL_CALLS). */
export async function githubTick(env: Env, now: Date): Promise<void> {
  if (!env.GITHUB_TOKEN) throw new JobError("auth", "GITHUB_TOKEN missing");
  await syncGithub(env, now);
}

const RENAMED: (readonly [string, string])[] = [...["projects", "languages", "code_freq", "commits_recent", "shots"].map((t) => [t, "repo"] as const),
  ...["uptime_summary", "daily_uptime", "incidents", "checks", "lighthouse"].map((t) => [t, "project"] as const)];

const LIGHT_COLS = "repo,name,repo_id,archived,homepage,url,url_source,topics,deps,description,language,stars,forks,created_at,pushed_at,updated_at_gh,release_tag,release_at,license,commit_count,ci_state,light_fp,updated_at";
// Website field set -> it is the live site (trusted). Removed, or a row whose url was never verified (pre-0008) -> url cleared and probing restarts.
const UPSERT = `INSERT INTO projects (${LIGHT_COLS}) VALUES (${LIGHT_COLS.split(",").map(() => "?").join(",")}) ON CONFLICT(repo) DO UPDATE SET ` +
  "name=excluded.name,repo_id=excluded.repo_id,archived=excluded.archived,homepage=excluded.homepage,topics=excluded.topics,description=excluded.description,language=excluded.language,stars=excluded.stars,forks=excluded.forks,created_at=excluded.created_at,pushed_at=excluded.pushed_at,updated_at_gh=excluded.updated_at_gh,release_tag=excluded.release_tag,release_at=excluded.release_at,license=excluded.license,commit_count=excluded.commit_count,ci_state=excluded.ci_state,light_fp=excluded.light_fp,updated_at=excluded.updated_at," +
  "url=CASE WHEN excluded.url_source='website' THEN excluded.url WHEN projects.url_source IS NULL OR projects.url_source='website' THEN NULL ELSE projects.url END," +
  "url_source=CASE WHEN excluded.url_source='website' THEN 'website' WHEN projects.url_source IS NULL OR projects.url_source='website' THEN NULL ELSE projects.url_source END," +
  "probe_at=CASE WHEN excluded.url_source IS NULL AND (projects.url_source IS NULL OR projects.url_source='website') THEN NULL ELSE projects.probe_at END";

export async function syncGithub(env: Env, now = new Date()): Promise<void> {
  if (!env.GITHUB_TOKEN) return console.warn("GITHUB_TOKEN missing, skipping GitHub sync");
  const db = env.DB;

  // (1) list pass, one GraphQL query per 100 repos (<= MAX_LIST_PAGES). Any failure throws before a single write, so a bad list never deletes data.
  const nodes: GqlRepo[] = [];
  let after: string | null = null, more = false;
  for (let i = 0; i < MAX_LIST_PAGES; i++) {
    const conn: NonNullable<NonNullable<ReposResp["data"]>["viewer"]>["repositories"] | undefined = (await gql<ReposResp>(env, LIST_QUERY, { after, n: LIST_PAGE })).data?.viewer?.repositories;
    if (!conn) throw new JobError("parse", "graphql repositories: no data");
    nodes.push(...conn.nodes.filter((n): n is GqlRepo => !!n));
    more = conn.pageInfo.hasNextPage;
    if (!more) break;
    after = conn.pageInfo.endCursor;
  }
  const { pub: repos, priv } = mapList(nodes);
  if (more) console.warn(`repo list truncated at ${nodes.length} repos: no deletes, previous private aggregates kept`);
  const ts = now.toISOString();

  const [prevQ, privQ] = (await db.batch([
    db.prepare("SELECT repo, repo_id, light_fp FROM projects"),
    db.prepare("SELECT value FROM meta WHERE key='priv_fp'"),
  ])) as { results: { repo: string; repo_id: string | null; light_fp: string | null; value?: string }[] }[];
  const prev = prevQ.results;
  // Wipe guard: an empty or less-than-half result while rows exist is a bad response, never a mass delete.
  if (prev.length && repos.length * 2 < prev.length) throw new JobError("parse", `sync returned ${repos.length} of ${prev.length} repos, refusing to delete`);
  // Rename: same permanent id under a new name. Re-key every table in this batch (OR IGNORE: a PK clash leaves the old row for orphan cleanup).
  const idToRepo = new Map(prev.flatMap((p) => (p.repo_id ? [[p.repo_id, p.repo] as const] : [])));
  const renames = repos.flatMap((r) => { const old = r.repo_id ? idToRepo.get(r.repo_id) : undefined; return old && old !== r.full_name ? [{ old, to: r.full_name, name: r.name }] : []; });
  const bare = (full: string) => full.split("/").pop()!;
  // Only rows whose light fields moved are written (a renamed row has no stored fp under its new name, so it is rewritten).
  const fpOf = new Map(prev.map((p) => [p.repo, p.light_fp]));
  const fps = await Promise.all(repos.map((r) => sha(JSON.stringify(r))));
  const changed = repos.flatMap((r, i) => (fpOf.get(r.full_name) === fps[i] ? [] : [{ r, fp: fps[i] }]));
  const privFp = await sha(JSON.stringify(priv));

  // Private repos: aggregates only (language bytes, repo + commit counts); nothing identifying is ever bound.
  await db.batch([
    ...renames.flatMap((x) => [
      ...RENAMED.map(([t, col]) => db.prepare(`UPDATE OR IGNORE ${t} SET ${col}=? WHERE ${col}=?`).bind(x.to, x.old)),
      db.prepare("UPDATE repo_alias SET repo=? WHERE repo=?").bind(x.to, x.old), // chains: a -> b -> c
      db.prepare("DELETE FROM repo_alias WHERE old_name=?").bind(x.name), // renamed back
      // Case-only renames need no alias: lookups are case-insensitive.
      ...(bare(x.old).toLowerCase() === x.name.toLowerCase() ? [] : [db.prepare("INSERT INTO repo_alias (old_name,repo) VALUES (?,?) ON CONFLICT(old_name) DO UPDATE SET repo=excluded.repo").bind(bare(x.old), x.to)]),
    ]),
    ...changed.flatMap(({ r, fp }) => {
      const web = websiteUrl(r.homepage);
      return [
        db.prepare(UPSERT).bind(r.full_name, r.name, r.repo_id, r.archived ? 1 : 0, r.homepage, web, web ? "website" : null, JSON.stringify(r.topics), "[]", r.description, r.language, r.stars, r.forks, r.created_at, r.pushed_at, r.updated_at_gh, r.release_tag, r.release_at, r.license, r.commit_count, r.ci_state, fp, ts),
        db.prepare("DELETE FROM languages WHERE repo=?").bind(r.full_name),
        ...(r.langs.length ? [db.prepare(`INSERT INTO languages (repo,lang,bytes,color) VALUES ${rows(r.langs.length, 4)}`).bind(...r.langs.flatMap((l) => [r.full_name, l.lang, l.bytes, l.color]))] : []),
      ];
    }),
    setMeta(db, "list_at", ts),
    // Truncated list = unseen repos and incomplete private totals: delete nothing, keep the previous aggregates.
    ...(more ? [setMeta(db, "list_truncated", String(nodes.length))] : [
      db.prepare("DELETE FROM meta WHERE key='list_truncated'"),
      db.prepare("DELETE FROM projects WHERE repo NOT IN (SELECT value FROM json_each(?))").bind(JSON.stringify(repos.map((r) => r.full_name))),
      ...["commits_recent", "languages", "code_freq"].map((t) => db.prepare(`DELETE FROM ${t} WHERE repo NOT IN (SELECT repo FROM projects)`)),
      ...(privQ.results[0]?.value === privFp ? [] : [
        db.prepare("DELETE FROM totals_private"),
        ...priv.langs.map((l) => db.prepare("INSERT INTO totals_private (lang,bytes,color) VALUES (?,?,?)").bind(l.lang, l.bytes, l.color)),
        // loc is owned by the daily code_frequency slot; this only refreshes counts.
        db.prepare("INSERT INTO private_agg (id,repos,commit_count) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET repos=excluded.repos,commit_count=excluded.commit_count").bind(priv.repos, priv.commits),
        setMeta(db, "priv_fp", privFp),
      ]),
    ]),
  ]);

  // (2) heatmap: daily at 00 UTC or when empty
  const empty = !(await db.prepare("SELECT COUNT(*) AS n FROM commits_daily").first<{ n: number }>())?.n;
  if ((now.getUTCHours() === 0 && now.getUTCMinutes() === 0) || empty) {
    try {
      const from = new Date(now.getTime() - HEATMAP_DAYS * 864e5).toISOString();
      const days = mapCalendar(await gql<CalendarResp>(env, CAL_QUERY, { login: env.GITHUB_OWNER, from, to: ts }));
      if (days.length) await db.batch(days.map((d) => db.prepare("INSERT INTO commits_daily (date,count) VALUES (?,?) ON CONFLICT(date) DO UPDATE SET count=excluded.count").bind(d.date, d.count)));
    } catch (e) { console.warn("heatmap sync failed", (e as Error)?.name); }
  }

  // (3) detail pass
  await syncDetail(env, now);
}

/**
 * Detail pass: README, .devpulse.json, package.json, wrangler config, manifest.json and recent commits for public repos that changed.
 * Due = never read (immediately), or pushed/updated on GitHub after the last read AND that read is >= DETAIL_MIN_GAP_S old (owner rule: at most daily, only on change).
 * <= DETAIL_CALLS x DETAIL_BATCH repos per slot, never-read first; the rest wait for the next slot.
 */
export async function syncDetail(env: Env, now = new Date()): Promise<void> {
  const db = env.DB;
  const due = (await db.prepare(
    "SELECT repo, repo_id FROM projects WHERE repo_id IS NOT NULL AND (detail_at IS NULL OR ((pushed_at > detail_at OR updated_at_gh > detail_at) AND detail_at <= ?)) ORDER BY detail_at IS NOT NULL, pushed_at DESC LIMIT ?",
  ).bind(isoS(new Date(+now - DETAIL_MIN_GAP_S * 1000)), DETAIL_BATCH * DETAIL_CALLS).all<{ repo: string; repo_id: string }>()).results.slice(0, DETAIL_BATCH * DETAIL_CALLS);
  if (!due.length) return;
  const stamp = isoS(now);
  const out: DetailRow[] = [];
  for (let i = 0; i < due.length; i += DETAIL_BATCH) {
    const j = await gql<{ data?: { nodes?: (GqlDetail | null)[] } }>(env, DETAIL_QUERY, { ids: due.slice(i, i + DETAIL_BATCH).map((d) => d.repo_id) }, true);
    out.push(...(j.data?.nodes ?? []).flatMap((n) => (n?.id && n.nameWithOwner && n.isPrivate === false ? [mapDetail(n, env.GITHUB_OWNER, env.WORKERS_SUBDOMAIN)] : [])));
  }
  if (!out.length) return;
  await db.batch([
    ...out.flatMap((d) => {
      const cands = JSON.stringify(d.site_cands);
      // A changed candidate list restarts probing (the verified url stays until the next probe decides).
      const keep = (c: string) => `${c}=CASE WHEN site_cands IS ?1 THEN ${c} ELSE NULL END`;
      return [
        db.prepare(`UPDATE projects SET ${keep("probe_url")},${keep("probe_ok")},${keep("probe_at")},site_cands=?1,deps=?2,tagline=?3,featured=?4,cover_path=?5,readme_excerpt=?6,links_json=?7,sheet_id=?8,kind=?9,readme_image=?10,audit=?11,showcase_json=?12,detail_at=?13 WHERE repo=?14`)
          .bind(cands, JSON.stringify(d.deps), d.showcase.tagline, d.showcase.featured ? 1 : 0, d.showcase.image, d.readme, JSON.stringify(d.showcase.links), d.sheet_id, d.kind, d.readme_image, JSON.stringify(d.audit), JSON.stringify(d.showcase_json), stamp, d.repo),
        ...(d.commits.length ? [db.prepare(`INSERT INTO commits_recent (repo,sha,message,author,ts,url) VALUES ${rows(d.commits.length, 6)} ON CONFLICT(sha) DO UPDATE SET repo=excluded.repo WHERE repo NOT IN (SELECT repo FROM projects)`).bind(...d.commits.flatMap((c) => [c.repo, c.sha, c.message, c.author, c.ts, c.url]))] : []),
      ];
    }),
    db.prepare("DELETE FROM commits_recent WHERE sha NOT IN (SELECT sha FROM commits_recent ORDER BY ts DESC LIMIT ?) AND sha NOT IN (SELECT sha FROM (SELECT sha, ROW_NUMBER() OVER (PARTITION BY repo ORDER BY ts DESC) AS rn FROM commits_recent) WHERE rn <= ?)").bind(COMMITS_KEPT, COMMITS_PER_REPO),
  ]);
}
