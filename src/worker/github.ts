import type { Env } from "./env";
import { COMMITS_KEPT, HEATMAP_DAYS, MAX_REPOS } from "./config";
import { decodeContent, mapCalendar, mapCommits, mapRun, parseDeps, selectProjects, siteUrl, type CalendarResp, type GhCommit, type Repo } from "./lib/github-parse";
import { pool, TIMEOUT_MS } from "./lib/http";

const API = "https://api.github.com";
const CONCURRENCY = 4;
const QUERY = "query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}";

export async function syncGithub(env: Env, now = new Date()): Promise<void> {
  if (!env.GITHUB_TOKEN) return console.warn("GITHUB_TOKEN missing, skipping GitHub sync");
  const h = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "devpulse" };
  const req = (path: string, init: RequestInit = {}) => fetch(API + path, { headers: h, signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
  const get = async (path: string) => {
    const r = await req(path);
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
  };
  const db = env.DB;

  // (1) discover
  const all: Repo[] = [];
  for (let page = 1; ; page++) {
    const batch = (await get(`/users/${env.GITHUB_OWNER}/repos?per_page=100&page=${page}`)) as Repo[];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  const eligible = selectProjects(all);
  if (eligible.length > MAX_REPOS) console.warn(`${eligible.length} repos exceed MAX_REPOS=${MAX_REPOS}; syncing the ${MAX_REPOS} most recently pushed`);
  const repos = eligible.slice(0, MAX_REPOS);
  const ts = now.toISOString();

  // (2) per repo (bounded concurrency): deps, CI, commits -> statements, applied in one batch below
  const perRepo = await pool(repos, CONCURRENCY, async (r) => {
    const f = r.full_name;
    const out: D1PreparedStatement[] = [];
    // each sub-fetch fails independently so one 403/404 doesn't drop the others
    const step = async (what: string, fn: () => Promise<void>) => {
      try { await fn(); } catch (e) { console.warn(`sync ${f} ${what} failed`, e); }
    };
    await step("deps", async () => { // 404 = no file
      const c = await req(`/repos/${f}/contents/.devpulse.json`);
      const deps = c.ok ? parseDeps(decodeContent((await c.json()) as { content: string })) : [];
      out.push(db.prepare("UPDATE projects SET deps=? WHERE repo=?").bind(JSON.stringify(deps), f));
    });
    await step("ci", async () => {
      const run = mapRun((await get(`/repos/${f}/actions/runs?per_page=1&branch=${encodeURIComponent(r.default_branch)}`)) as Parameters<typeof mapRun>[0]);
      if (run) out.push(db.prepare("INSERT INTO ci (repo,status,conclusion,url,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(repo) DO UPDATE SET status=excluded.status,conclusion=excluded.conclusion,url=excluded.url,updated_at=excluded.updated_at").bind(f, run.status, run.conclusion, run.url, run.updated_at));
    });
    await step("commits", async () => {
      for (const m of mapCommits(f, (await get(`/repos/${f}/commits?per_page=10`)) as GhCommit[]))
        out.push(db.prepare("INSERT INTO commits_recent (repo,sha,message,author,ts,url) VALUES (?,?,?,?,?,?) ON CONFLICT(sha) DO NOTHING").bind(m.repo, m.sha, m.message, m.author, m.ts, m.url));
    });
    return out;
  });

  // Every selected repo gets updated_at=ts, so stale projects are `updated_at <> ts` (one bound param, however many repos).
  await db.batch([
    ...repos.map((r) =>
      db.prepare("INSERT INTO projects (repo,name,url,topics,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(repo) DO UPDATE SET name=excluded.name,url=excluded.url,topics=excluded.topics,updated_at=excluded.updated_at")
        .bind(r.full_name, r.name, siteUrl(r), JSON.stringify(r.topics), ts)),
    db.prepare("DELETE FROM projects WHERE updated_at <> ?").bind(ts),
    ...["ci", "commits_recent"].map((t) => db.prepare(`DELETE FROM ${t} WHERE repo NOT IN (SELECT repo FROM projects)`)),
    ...perRepo.flat(),
    db.prepare("DELETE FROM commits_recent WHERE sha NOT IN (SELECT sha FROM commits_recent ORDER BY ts DESC LIMIT ?)").bind(COMMITS_KEPT),
  ]);

  // (3) heatmap: daily at 00 UTC or when empty
  const empty = !(await db.prepare("SELECT COUNT(*) AS n FROM commits_daily").first<{ n: number }>())?.n;
  if (now.getUTCHours() === 0 || empty) {
    try {
      const from = new Date(now.getTime() - HEATMAP_DAYS * 864e5).toISOString();
      const r = await req("/graphql", { method: "POST", body: JSON.stringify({ query: QUERY, variables: { login: env.GITHUB_OWNER, from, to: ts } }) });
      if (!r.ok) throw new Error(`graphql ${r.status}`);
      const days = mapCalendar((await r.json()) as CalendarResp);
      if (days.length) await db.batch(days.map((d) => db.prepare("INSERT INTO commits_daily (date,count) VALUES (?,?) ON CONFLICT(date) DO UPDATE SET count=excluded.count").bind(d.date, d.count)));
    } catch (e) { console.warn("heatmap sync failed", e); }
  }
}
