import { afterEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "../../src/worker/api";
import { checkAlerts } from "../../src/worker/alerts";
import { runScheduled } from "../../src/worker/cron";
import { githubTick, syncGithub } from "../../src/worker/github";
import { computeHealth, parseExpiry } from "../../src/worker/lib/jobs";
import { pruneChecks } from "../../src/worker/prune";
import type { Env } from "../../src/worker/env";
import { sqliteDb } from "./_sqlite";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const T = new Date("2026-10-05T03:15:00Z");
let tick = 0;
const at = () => new Date(+T + ++tick * 1000); // each sync needs its own updated_at stamp
const now = () => Math.floor(Date.now() / 1000);
const node = (id: string, name: string, extra: object = {}) => ({
  id, nameWithOwner: `o/${name}`, name, isPrivate: false, isArchived: false, pushedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
  repositoryTopics: { nodes: [] }, languages: { edges: [{ size: 5, node: { name: "TS", color: null } }] }, defaultBranchRef: { target: { statusCheckRollup: { state: "SUCCESS" }, history: { totalCount: 1, nodes: [{ oid: "sha1", messageHeadline: "m", committedDate: "2026-10-01T00:00:00Z", url: "u", author: { name: "a" } }] } } }, ...extra,
});
/** GraphQL fake: every repo query (check or full) answers with `world.nodes`. */
const world = { nodes: [] as object[], headers: {} as Record<string, string>, status: 200 };
const stub = () => {
  const queries: string[] = [];
  vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
    const q = JSON.parse(init.body as string).query as string;
    queries.push(q);
    if (world.status !== 200) return new Response("", { status: world.status });
    const body = q.includes("contributionCalendar") ? { data: { user: { contributionsCollection: { contributionCalendar: { weeks: [] } } } } } : { data: { viewer: { repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: world.nodes } } } };
    return new Response(JSON.stringify(body), { headers: world.headers });
  });
  return queries;
};
const mk = () => { const s = sqliteDb(); return { ...s, env: { DB: s.db, GITHUB_TOKEN: "t", GITHUB_OWNER: "o" } as unknown as Env }; };
const rows = (raw: any, sql: string) => (raw.prepare(sql).all() as object[]).map((r) => ({ ...r }));
const projectNames = (raw: any) => rows(raw, "SELECT name FROM projects ORDER BY name").map((r: any) => r.name);

describe("change check", () => {
  it("full sync only when the fingerprint moved; hourly always syncs", async () => {
    world.status = 200;
    const { env, raw } = mk();
    world.nodes = [node("A", "alpha"), node("B", "beta")];
    const q = stub();
    await githubTick(env, T, false); // empty meta => changed => check + full sync
    expect(projectNames(raw)).toEqual(["alpha", "beta"]);
    expect(rows(raw, "SELECT value FROM meta WHERE key='fp'")[0]).toMatchObject({ value: expect.stringMatching(/^[0-9a-f]{64}$/) });
    q.length = 0;
    await githubTick(env, T, false); // same data: the check alone, no full query
    expect(q.length).toBe(1);
    expect(q[0]).not.toContain("description");
    q.length = 0;
    world.nodes = [node("A", "alpha", { pushedAt: "2026-10-02T00:00:00Z" }), node("B", "beta")];
    await githubTick(env, T, false);
    expect(q.some((x) => x.includes("description"))).toBe(true);
    q.length = 0;
    await githubTick(env, T, true); // hourly safety net: no check, straight to the sync
    expect(q.filter((x) => x.includes("description")).length).toBe(1);
    expect(q[0]).toContain("description");
  });
});

describe("wipe guard", () => {
  it("refuses an empty or less-than-half result, keeps every row, allows exactly half", async () => {
    const { env, raw } = mk();
    world.nodes = ["a", "b", "c", "d"].map((n, i) => node(`I${i}`, n));
    stub();
    await syncGithub(env, at());
    expect(projectNames(raw)).toHaveLength(4);
    world.nodes = [];
    await expect(syncGithub(env, at())).rejects.toMatchObject({ code: "parse" });
    world.nodes = [node("I0", "a")];
    await expect(syncGithub(env, at())).rejects.toMatchObject({ code: "parse" });
    expect(projectNames(raw)).toHaveLength(4);
    world.nodes = [node("I0", "a"), node("I1", "b")];
    await syncGithub(env, at());
    expect(projectNames(raw)).toEqual(["a", "b"]);
  });
});

describe("rename", () => {
  const seedAll = (raw: any) => {
    raw.exec(`INSERT INTO projects (repo,name,repo_id,updated_at) VALUES ('o/old','old','X','t');
      INSERT INTO languages VALUES ('o/old','TS',5,NULL); INSERT INTO code_freq VALUES ('o/old',1,2,3);
      INSERT INTO commits_recent VALUES ('o/old','sha1','m','a','2026-10-01T00:00:00Z','u');
      INSERT INTO uptime_summary VALUES ('o/old',1,99,'[]',1); INSERT INTO daily_uptime VALUES ('o/old','2026-10-01',1,1);
      INSERT INTO incidents (project,start_ts) VALUES ('o/old',1); INSERT INTO checks VALUES ('o/old',1,1,200,5);
      INSERT INTO lighthouse VALUES ('o/old','2026-W40',9,9,9,9);`);
  };
  const keys = (raw: any) => ["projects.repo", "languages.repo", "code_freq.repo", "commits_recent.repo", "uptime_summary.project", "daily_uptime.project", "incidents.project", "checks.project", "lighthouse.project"]
    .map((tc) => { const [t, c] = tc.split("."); return rows(raw, `SELECT DISTINCT ${c} AS k FROM ${t}`).map((r: any) => r.k); });

  it("re-keys every table in one sync, keeps the commit, stores the alias", async () => {
    const { env, raw } = mk();
    seedAll(raw);
    world.nodes = [node("X", "new")]; // same id, new name; its history contains the stored sha1
    stub();
    await syncGithub(env, at());
    for (const k of keys(raw)) expect(k).toEqual(["o/new"]);
    expect(rows(raw, "SELECT old_name, repo FROM repo_alias")).toEqual([{ old_name: "old", repo: "o/new" }]);
    expect(rows(raw, "SELECT COUNT(*) AS n FROM commits_recent")[0]).toEqual({ n: 1 });
  });

  it("chained rename moves the alias; renaming back drops it; case-only rename needs none", async () => {
    const { env, raw } = mk();
    seedAll(raw);
    stub();
    world.nodes = [node("X", "new")];
    await syncGithub(env, at());
    world.nodes = [node("X", "newer")];
    await syncGithub(env, at());
    expect(rows(raw, "SELECT old_name, repo FROM repo_alias ORDER BY old_name")).toEqual([{ old_name: "new", repo: "o/newer" }, { old_name: "old", repo: "o/newer" }]);
    world.nodes = [node("X", "old")];
    await syncGithub(env, at());
    expect(rows(raw, "SELECT old_name FROM repo_alias").map((r: any) => r.old_name)).toEqual(["new", "newer"]);
    world.nodes = [node("X", "OLD")];
    await syncGithub(env, at());
    expect(rows(raw, "SELECT old_name FROM repo_alias").map((r: any) => r.old_name)).toEqual(["new", "newer"]);
    for (const k of keys(raw)) expect(k).toEqual(["o/OLD"]);
  });

  it("commit stored under a vanished repo name is healed by the next insert", async () => {
    const { env, raw } = mk();
    raw.exec("INSERT INTO commits_recent VALUES ('o/gone','sha1','m','a','2026-10-01T00:00:00Z','u')");
    world.nodes = [node("X", "new")];
    stub();
    await syncGithub(env, at());
    expect(rows(raw, "SELECT repo FROM commits_recent")).toEqual([{ repo: "o/new" }]);
  });

  it("/badge /card /p /img: alias and case differences 301 to the canonical name; the canonical one serves", async () => {
    const { env, raw } = mk();
    seedAll(raw);
    world.nodes = [node("X", "New")];
    stub();
    await syncGithub(env, at());
    const e = { ...env, ASSETS: { fetch: async () => new Response("<html><head><title>x</title></head></html>") } } as unknown as Env;
    const get = (p: string) => handleApi(new Request("http://x" + p), e);
    for (const [from, to] of [["/badge/old.svg", "/badge/New.svg"], ["/badge/new.svg", "/badge/New.svg"], ["/card/OLD.svg", "/card/New.svg"], ["/p/old", "/p/New"], ["/img/old?v=1", "/img/New?v=1"]]) {
      const r = await get(from);
      expect([from, r.status, r.headers.get("Location")]).toEqual([from, 301, to]);
      expect(r.headers.get("Cache-Control")).toBe("no-store"); // case variants must not grow the edge cache
    }
    expect((await get("/badge/New.svg")).status).toBe(200);
    expect((await get("/card/New.svg")).status).toBe(200);
    expect((await get("/p/New")).status).toBe(200);
    expect((await get("/badge/nope.svg")).status).toBe(404);
  });
});

describe("orphan cleanup", () => {
  it("removes history only after the 7-day grace; prunes old lighthouse weeks and dead aliases", async () => {
    const { env, raw } = mk();
    const t = now();
    raw.exec(`INSERT INTO projects (repo,name,updated_at) VALUES ('o/live','live','t');
      INSERT INTO uptime_summary VALUES ('o/live',1,1,'[]',${t}), ('o/recent',1,1,'[]',${t - 3 * 86400}), ('o/dead',1,1,'[]',${t - 8 * 86400});
      INSERT INTO checks VALUES ('o/live',${t},1,200,1), ('o/recent',${t},1,200,1), ('o/dead',${t},1,200,1);
      INSERT INTO daily_uptime VALUES ('o/recent','2999-01-01',1,1), ('o/dead','2999-01-01',1,1);
      INSERT INTO incidents (project,start_ts,end_ts) VALUES ('o/recent',${t},${t}), ('o/dead',${t},${t});
      INSERT INTO lighthouse VALUES ('o/live','2999-W01',1,1,1,1), ('o/live','2020-W01',1,1,1,1), ('o/recent','2999-W01',1,1,1,1), ('o/dead','2999-W01',1,1,1,1);
      INSERT INTO repo_alias VALUES ('old','o/live'), ('older','o/dead')`);
    await pruneChecks(env);
    const proj = (tbl: string, col = "project") => rows(raw, `SELECT DISTINCT ${col} AS p FROM ${tbl} ORDER BY p`).map((r: any) => r.p);
    expect(proj("checks")).toEqual(["o/live", "o/recent"]);
    expect(proj("daily_uptime")).toEqual(["o/recent"]);
    expect(proj("incidents")).toEqual(["o/recent"]);
    expect(proj("lighthouse")).toEqual(["o/live", "o/recent"]);
    expect(rows(raw, "SELECT week FROM lighthouse WHERE project='o/live'")).toEqual([{ week: "2999-W01" }]);
    expect(proj("repo_alias", "old_name")).toEqual(["old"]);
  });
});

describe("heartbeat", () => {
  it("records the error code only on failure, clears it on success", async () => {
    const { env, raw } = mk();
    world.status = 401;
    stub();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runScheduled({ scheduledTime: +T } as ScheduledController, env);
    const jobs = () => Object.fromEntries(rows(raw, "SELECT * FROM jobs").map((r: any) => [r.job, r]));
    expect(jobs().github).toMatchObject({ last_ok: null, last_err_code: "auth" });
    expect(jobs().github.last_err_at).toBeGreaterThan(0);
    expect(jobs().uptime.last_ok).toBeGreaterThan(0);
    expect(JSON.stringify(rows(raw, "SELECT * FROM jobs"))).not.toContain("graphql");
    world.status = 200;
    world.nodes = [node("A", "alpha")];
    await runScheduled({ scheduledTime: +T } as ScheduledController, env);
    expect(jobs().github).toMatchObject({ last_err_code: null, last_err_at: null });
    expect(jobs().github.last_ok).toBeGreaterThan(0);
  });
  it("maps rate limits and server errors to rate/http", async () => {
    const { env, raw } = mk();
    vi.spyOn(console, "error").mockImplementation(() => {});
    stub();
    for (const [status, code] of [[429, "rate"], [403, "rate"], [502, "http"]] as const) {
      world.status = status;
      await runScheduled({ scheduledTime: +T } as ScheduledController, env);
      expect(rows(raw, "SELECT last_err_code FROM jobs WHERE job='github'")).toEqual([{ last_err_code: code }]);
    }
  });
});

describe("token expiry header", () => {
  it("parses present, absent and malformed values", () => {
    expect(parseExpiry("2026-12-31 12:00:00 UTC")).toBe(Date.UTC(2026, 11, 31, 12) / 1000);
    expect(parseExpiry("2026-12-31T12:00:00Z")).toBe(Date.UTC(2026, 11, 31, 12) / 1000);
    for (const bad of [null, undefined, "", "soon", "2026-13-45 99:99:99 UTC", "1999-01-01 00:00:00 UTC", "2026-12-31"]) expect(parseExpiry(bad)).toBeNull();
  });
  it("is stored from a GraphQL response, and cleared when a later response has none", async () => {
    const { env, raw } = mk();
    world.status = 200;
    world.nodes = [node("A", "alpha")];
    world.headers = { "GitHub-Authentication-Token-Expiration": "2099-01-01 00:00:00 UTC" };
    stub();
    await runScheduled({ scheduledTime: +T } as ScheduledController, env);
    expect(rows(raw, "SELECT value FROM meta WHERE key='token_exp'")).toEqual([{ value: String(Date.UTC(2099, 0, 1) / 1000) }]);
    world.headers = {};
    await runScheduled({ scheduledTime: +T } as ScheduledController, env);
    expect(rows(raw, "SELECT value FROM meta WHERE key='token_exp'")).toEqual([]);
  });
});

describe("health", () => {
  it("/api/health is no-store with job ages, stale flag and token days; /api/stats carries health", async () => {
    const { env, raw } = mk();
    const t = now();
    raw.exec(`INSERT INTO jobs (job,last_ok) VALUES ('uptime',${t - 60}), ('github',${t - 4 * 3600});
      INSERT INTO meta VALUES ('token_exp','${t + 10 * 86400 + 60}')`);
    const r = await handleApi(new Request("http://x/api/health"), env);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const b = (await r.json()) as any;
    expect(b).toMatchObject({ ok: false, stale: true, tokenDaysLeft: 10, jobs: { uptime: { ageMin: 1, ok: true }, github: { ageMin: 240, ok: true } } });
    expect(new Date(b.since).getTime() / 1000).toBe(t - 4 * 3600);
    const s = (await (await handleApi(new Request("http://x/api/stats"), env)).json()) as any;
    expect(s.health).toMatchObject({ stale: true, tokenDaysLeft: 10 });
  });
  it("not stale with no jobs yet, and a failing streak counts after the limit", () => {
    expect(computeHealth([], undefined)).toMatchObject({ stale: false, since: null, tokenDaysLeft: null, jobs: {} });
    const t = now();
    const j = (last_err_at: number) => [{ job: "github", last_ok: null, last_err_code: "auth", last_err_at, alerted_at: null }];
    expect(computeHealth(j(t - 3600), null).stale).toBe(false);
    expect(computeHealth(j(t - 4 * 3600), null)).toMatchObject({ stale: true, jobs: { github: { ageMin: null, ok: false } } });
  });
});

describe("alerts", () => {
  const setup = (extra: Partial<Env> = {}) => {
    const { db, raw } = sqliteDb();
    const sent: { from: string; to: string; raw: string }[] = [];
    const env = { DB: db, ALERT: { send: async (m: any) => void sent.push(m) }, ALERT_FROM: "alerts@x.test", ALERT_TO: "me@x.test", ...extra } as unknown as Env;
    return { env, raw, sent };
  };
  const subject = (m: { raw: string }) => /^Subject: (.*)$/m.exec(m.raw)![1];
  it("fires once when GitHub sync is stale, then one recovery mail", async () => {
    const { env, raw, sent } = setup();
    const t = now();
    raw.exec(`INSERT INTO jobs (job,last_ok) VALUES ('github',${t - 4 * 3600}), ('uptime',${t})`);
    await checkAlerts(env);
    await checkAlerts(env);
    expect(sent).toHaveLength(1);
    expect(subject(sent[0])).toMatch(/^DevPulse: GitHub sync stale since \d\d:\d\d UTC$/);
    expect([sent[0].from, sent[0].to]).toEqual(["alerts@x.test", "me@x.test"]);
    expect(rows(raw, "SELECT alerted_at FROM jobs WHERE job='github'")[0]).toMatchObject({ alerted_at: expect.any(Number) });
    raw.exec(`UPDATE jobs SET last_ok=${t} WHERE job='github'`);
    await checkAlerts(env);
    await checkAlerts(env);
    expect(sent).toHaveLength(2);
    expect(subject(sent[1])).toBe("DevPulse: GitHub sync recovered");
    expect(rows(raw, "SELECT alerted_at FROM jobs WHERE job='github'")).toEqual([{ alerted_at: null }]);
  });
  it("uptime older than 45 min and a token within 14 days each alert once", async () => {
    const { env, raw, sent } = setup();
    const t = now();
    raw.exec(`INSERT INTO jobs (job,last_ok) VALUES ('github',${t}), ('uptime',${t - 50 * 60}); INSERT INTO meta VALUES ('token_exp','${t + 5 * 86400 + 60}')`);
    await checkAlerts(env);
    await checkAlerts(env);
    expect(sent).toHaveLength(2);
    expect(sent.map(subject).some((s) => /^DevPulse: uptime checks stale since \d\d:\d\d UTC$/.test(s))).toBe(true);
    expect(sent.map(subject).some((s) => s === "DevPulse: GitHub token expires in 5 days")).toBe(true);
    raw.exec(`UPDATE meta SET value='${t + 90 * 86400}' WHERE key='token_exp'`);
    await checkAlerts(env);
    expect(sent.map(subject)).toContain("DevPulse: GitHub token renewed");
  });
  it("is a silent no-op without the binding or ALERT_TO, and never throws", async () => {
    const t = now();
    for (const extra of [{ ALERT: undefined }, { ALERT_TO: undefined }] as Partial<Env>[]) {
      const { env, raw, sent } = setup(extra);
      raw.exec(`INSERT INTO jobs (job,last_ok) VALUES ('github',${t - 9 * 3600})`);
      await checkAlerts(env);
      expect(sent).toHaveLength(0);
      expect(rows(raw, "SELECT alerted_at FROM jobs")).toEqual([{ alerted_at: null }]);
    }
    const bad = setup({ DB: {} as D1Database });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(checkAlerts(bad.env)).resolves.toBeUndefined();
    // a failing send is not recorded, so the next slot retries
    const failing = setup({ ALERT: { send: async () => { throw new Error("nope"); } } as unknown as SendEmail });
    failing.raw.exec(`INSERT INTO jobs (job,last_ok) VALUES ('github',${t - 9 * 3600})`);
    await checkAlerts(failing.env);
    expect(rows(failing.raw, "SELECT alerted_at FROM jobs")).toEqual([{ alerted_at: null }]);
  });
});
