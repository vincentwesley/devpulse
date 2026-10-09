import { afterEach, describe, expect, it, vi } from "vitest";
import repos from "../fixtures/github/repos.json";
import runs from "../fixtures/github/runs.json";
import commits from "../fixtures/github/commits.json";
import calendar from "../fixtures/github/calendar.json";
import file from "../fixtures/github/devpulse-file.json";
import { mapCalendar, mapCommits, mapRun, parseDeps, selectProjects } from "../../src/worker/lib/github-parse";
import { syncGithub } from "../../src/worker/github";
import { route } from "../../src/worker/routes/github";
import type { Env } from "../../src/worker/env";

type Q = { sql: string; args: unknown[] };

/** Minimal D1 fake: records every statement; `rows` answers all()/first() by SQL substring. */
function fakeDb(rows: Record<string, unknown[]> = {}) {
  const log: Q[] = [];
  const stmt = (sql: string, args: unknown[] = []) => {
    const q = { sql, args };
    const match = () => Object.entries(rows).find(([k]) => sql.includes(k))?.[1] ?? [];
    return {
      q,
      bind: (...a: unknown[]) => stmt(sql, a),
      run: async () => (log.push(q), {}),
      all: async () => (log.push(q), { results: match() }),
      first: async () => (log.push(q), (match() as unknown[])[0] ?? null),
    };
  };
  const db = { prepare: (s: string) => stmt(s), batch: async (ss: { q: Q }[]) => void log.push(...ss.map((s) => s.q)) };
  return { db: db as unknown as D1Database, log };
}

afterEach(() => vi.unstubAllGlobals());

describe("parsers", () => {
  it("keeps only public repos with topic + homepage", () => {
    expect(selectProjects(repos).map((r) => r.full_name)).toEqual(["o/metalens"]);
  });
  it("validates .devpulse.json", () => {
    expect(parseDeps('{"deps":["https://www.githubstatus.com"]}')).toEqual(["https://www.githubstatus.com"]);
    expect(parseDeps('{"deps":["http://insecure.com"]}')).toEqual([]);
    expect(parseDeps('{"deps":["javascript:alert(1)"]}')).toEqual([]);
    expect(parseDeps('{"deps":["https://ok.com","nope"]}')).toEqual([]);
    expect(parseDeps(`{"deps":${JSON.stringify(Array(11).fill("https://a.com"))}}`)).toEqual([]);
    expect(parseDeps("not json")).toEqual([]);
    expect(parseDeps('{"deps":"https://a.com"}')).toEqual([]);
  });
  it("maps run, commits, calendar", () => {
    expect(mapRun(runs)).toMatchObject({ status: "completed", conclusion: "success" });
    expect(mapRun({})).toBeNull();
    const c = mapCommits("o/metalens", commits);
    expect(c[0]).toMatchObject({ message: "feat: one", author: "vincentwesley", ts: "2026-10-08T09:00:00Z" });
    expect(c[1].author).toBe("Anon");
    expect(mapCalendar(calendar)).toEqual([
      { date: "2026-10-04", count: 0 }, { date: "2026-10-05", count: 3 }, { date: "2026-10-06", count: 7 },
    ]);
  });
});

describe("syncGithub", () => {
  const stubFetch = () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      const ok = (b: unknown) => new Response(JSON.stringify(b));
      if (url.includes("/users/")) return ok(repos);
      if (url.includes("/contents/")) return ok(file);
      if (url.includes("/actions/runs")) return ok(runs);
      if (url.includes("/commits")) return ok(commits);
      if (url.endsWith("/graphql")) return ok(calendar);
      return new Response("", { status: 404 });
    });
    return urls;
  };
  const env = (db: D1Database, token = "t") => ({ DB: db, GITHUB_TOKEN: token, GITHUB_OWNER: "o" }) as unknown as Env;

  it("skips without token", async () => {
    const urls = stubFetch();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await syncGithub(env(fakeDb().db, ""));
    expect(urls).toEqual([]);
  });

  it("syncs project, deps, ci, commits and heatmap when table empty", async () => {
    stubFetch();
    const { db, log } = fakeDb();
    await syncGithub(env(db), new Date("2026-10-09T05:00:00Z"));
    const sqls = log.map((q) => q.sql);
    expect(log.filter((q) => q.sql.startsWith("INSERT INTO projects")).map((q) => q.args[0])).toEqual(["o/metalens"]);
    expect(log.find((q) => q.sql.startsWith("UPDATE projects SET deps"))?.args).toEqual(['["https://www.githubstatus.com"]', "o/metalens"]);
    expect(log.find((q) => q.sql.startsWith("DELETE FROM projects"))?.args).toEqual(["o/metalens"]);
    expect(sqls.some((s) => s.startsWith("INSERT INTO ci"))).toBe(true);
    expect(sqls.filter((s) => s.includes("commits_recent (")).length).toBe(2);
    expect(sqls.filter((s) => s.startsWith("INSERT INTO commits_daily")).length).toBe(3);
  });

  it("skips heatmap off-hour when table has data", async () => {
    const urls = stubFetch();
    const { db } = fakeDb({ "COUNT(*)": [{ n: 5 }] });
    await syncGithub(env(db), new Date("2026-10-09T05:00:00Z"));
    expect(urls.some((u) => u.endsWith("/graphql"))).toBe(false);
    await syncGithub(env(db), new Date("2026-10-09T00:00:00Z"));
    expect(urls.some((u) => u.endsWith("/graphql"))).toBe(true);
  });
});

describe("routes", () => {
  const get = (p: string, db: D1Database) => route(new Request("http://x" + p), { DB: db } as Env, p);

  it("heatmap shape + cache header", async () => {
    const days = [{ date: "2026-10-05", count: 3 }];
    const r = (await get("/api/heatmap", fakeDb({ commits_daily: days }).db))!;
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(await r.json()).toEqual({ days });
  });
  it("commits: first line only", async () => {
    const row = { repo: "o/a", sha: "a1", message: "feat\n\nbody", author: "v", ts: "t", url: "u" };
    const r = (await get("/api/commits", fakeDb({ commits_recent: [row] }).db))!;
    expect(await r.json()).toEqual([{ ...row, message: "feat" }]);
  });
  it("null for other paths", async () => {
    expect(await get("/api/nope", fakeDb().db)).toBeNull();
  });
});
