import type { Env } from "./env";
import { decodeContent, mapCalendar, mapCommits, mapRun, parseDeps, selectProjects, type CalendarResp, type GhCommit, type Repo } from "./lib/github-parse";

const API = "https://api.github.com";
const QUERY = "query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}";

export async function syncGithub(env: Env, now = new Date()): Promise<void> {
  if (!env.GITHUB_TOKEN) return console.warn("GITHUB_TOKEN missing, skipping GitHub sync");
  const h = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "devpulse" };
  const get = async (path: string) => {
    const r = await fetch(API + path, { headers: h });
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
  const repos = selectProjects(all);
  const ts = now.toISOString();
  const names = repos.map((r) => r.full_name);
  const ph = names.map(() => "?").join(",");
  await db.batch([
    ...repos.map((r) =>
      db.prepare("INSERT INTO projects (repo,name,url,topics,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(repo) DO UPDATE SET name=excluded.name,url=excluded.url,topics=excluded.topics,updated_at=excluded.updated_at")
        .bind(r.full_name, r.name, r.homepage, JSON.stringify(r.topics), ts)),
    ...["projects", "ci", "commits_recent"].map((t) => db.prepare(`DELETE FROM ${t} WHERE repo NOT IN (${ph})`).bind(...names)),
  ]);

  for (const r of repos) {
    const f = r.full_name;
    try {
      // (2) deps; 404 = no file
      const c = await fetch(`${API}/repos/${f}/contents/.devpulse.json`, { headers: h });
      const deps = c.ok ? parseDeps(decodeContent((await c.json()) as { content: string })) : [];
      await db.prepare("UPDATE projects SET deps=? WHERE repo=?").bind(JSON.stringify(deps), f).run();
      // (3) CI
      const run = mapRun((await get(`/repos/${f}/actions/runs?per_page=1&branch=${encodeURIComponent(r.default_branch)}`)) as never);
      if (run) await db.prepare("INSERT INTO ci (repo,status,conclusion,url,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(repo) DO UPDATE SET status=excluded.status,conclusion=excluded.conclusion,url=excluded.url,updated_at=excluded.updated_at").bind(f, run.status, run.conclusion, run.url, run.updated_at).run();
      // (4) commits
      const cs = mapCommits(f, (await get(`/repos/${f}/commits?per_page=10`)) as GhCommit[]);
      if (cs.length) await db.batch(cs.map((m) => db.prepare("INSERT OR REPLACE INTO commits_recent (repo,sha,message,author,ts,url) VALUES (?,?,?,?,?,?)").bind(m.repo, m.sha, m.message, m.author, m.ts, m.url)));
    } catch (e) { console.warn(`sync ${f} failed`, e); }
  }
  await db.prepare("DELETE FROM commits_recent WHERE sha NOT IN (SELECT sha FROM commits_recent ORDER BY ts DESC LIMIT 50)").run();

  // (5) heatmap: daily at 00 UTC or when empty
  const empty = !(await db.prepare("SELECT COUNT(*) AS n FROM commits_daily").first<{ n: number }>())?.n;
  if (now.getUTCHours() === 0 || empty) {
    try {
      const from = new Date(now.getTime() - 365 * 864e5).toISOString();
      const r = await fetch(`${API}/graphql`, { method: "POST", headers: h, body: JSON.stringify({ query: QUERY, variables: { login: env.GITHUB_OWNER, from, to: ts } }) });
      if (!r.ok) throw new Error(`graphql ${r.status}`);
      const days = mapCalendar((await r.json()) as CalendarResp);
      if (days.length) await db.batch(days.map((d) => db.prepare("INSERT INTO commits_daily (date,count) VALUES (?,?) ON CONFLICT(date) DO UPDATE SET count=excluded.count").bind(d.date, d.count)));
    } catch (e) { console.warn("heatmap sync failed", e); }
  }
}
