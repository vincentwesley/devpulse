import { afterEach, describe, expect, it, vi } from "vitest";
import page from "../fixtures/github/repos-graphql.json";
import calendar from "../fixtures/github/calendar.json";
import { isHttps, mapCalendar, mapRepos, parseDeps, selectProjects, siteUrl, type GqlRepo } from "../../src/worker/lib/github-parse";
import { syncGithub } from "../../src/worker/github";
import { route } from "../../src/worker/routes/github";
import type { Env } from "../../src/worker/env";
import { fakeDb } from "./_db";

afterEach(() => vi.unstubAllGlobals());

const nodes = page.data.viewer.repositories.nodes as unknown as GqlRepo[];
const ok = (b: unknown) => new Response(JSON.stringify(b));

describe("parsers", () => {
  it("excludes private/archived/ignored; keeps repos without homepage; orders by push", () => {
    const { pub } = mapRepos(nodes);
    expect(pub.map((r) => r.full_name)).toEqual(["o/metalens", "o/bare"]);
    const base = { name: "x", homepage: null };
    const r = (n: string, pushed_at: string, homepage: string | null = null) => ({ ...base, full_name: n, homepage, pushed_at });
    const out = selectProjects([r("o/a", "2026-01-01T00:00:00Z"), r("o/b", "2026-03-01T00:00:00Z", "http://x"), r("o/c", "2026-02-01T00:00:00Z", "https://c.dev"), { ...r("o/f", "2026-04-01T00:00:00Z"), fork: true }]);
    expect(out.map((x) => x.full_name)).toEqual(["o/b", "o/c", "o/a"]);
    expect(selectProjects(out, 2).map((x) => x.full_name)).toEqual(["o/b", "o/c"]);
    expect(siteUrl(out[0])).toBeNull();
    expect(siteUrl(out[1])).toBe("https://c.dev");
    expect(isHttps("ftp://x")).toBe(false);
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
  it("maps a public repo from GraphQL", () => {
    const m = mapRepos(nodes).pub[0];
    expect(m).toMatchObject({
      description: "VGC meta tool", language: "TypeScript", stars: 7, forks: 2, release_tag: "v1.4.0", license: "MIT",
      commit_count: 120, ci_state: "SUCCESS", deps: ["https://www.githubstatus.com"], topics: ["vgc"],
      langs: [{ lang: "TypeScript", bytes: 9000, color: "#3178c6" }, { lang: "CSS", bytes: 1000, color: "#663399" }],
    });
    expect(m.commits.map((c) => [c.message, c.author])).toEqual([["feat: one", "vincentwesley"], ["fix: two", "Anon"]]);
    expect(mapRepos(nodes).pub[1]).toMatchObject({ commit_count: 0, ci_state: null, deps: [], langs: [], commits: [] });
  });
  it("aggregates private repos without identifying data", () => {
    const { priv } = mapRepos(nodes);
    expect(priv).toEqual({ repos: 1, commits: 33, langs: [{ lang: "Rust", bytes: 4000, color: "#dea584" }, { lang: "TypeScript", bytes: 1000, color: "#3178c6" }] });
  });
  it("oversized .devpulse.json is ignored", () => {
    const big = { ...nodes[0], object: { text: JSON.stringify({ deps: ["https://a.com"], pad: "x".repeat(9000) }) } };
    expect(mapRepos([big]).pub[0].deps).toEqual([]);
  });
  it("maps calendar", () => {
    expect(mapCalendar(calendar)).toEqual([
      { date: "2026-10-04", count: 0 }, { date: "2026-10-05", count: 3 }, { date: "2026-10-06", count: 7 },
    ]);
  });
});

/** GraphQL fake: calendar query vs repository pages (`pages` = nodes per page). */
const stubGql = (pages: unknown[][] = [nodes]) => {
  const calls: { query: string; variables: { after?: string | null } }[] = [];
  vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push(body);
    if (body.query.includes("contributionCalendar")) return ok(calendar);
    const i = body.variables.after ? Number(body.variables.after) : 0;
    return ok({ data: { viewer: { repositories: { pageInfo: { hasNextPage: i + 1 < pages.length, endCursor: String(i + 1) }, nodes: pages[i] } } } });
  });
  return calls;
};
const env = (db: D1Database, token = "t") => ({ DB: db, GITHUB_TOKEN: token, GITHUB_OWNER: "o" }) as unknown as Env;

describe("syncGithub", () => {
  it("skips without token", async () => {
    const calls = stubGql();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await syncGithub(env(fakeDb().db, ""));
    expect(calls).toEqual([]);
  });

  it("one GraphQL call + heatmap call writes projects, languages, commits, private aggregates", async () => {
    const calls = stubGql();
    const { db, log } = fakeDb();
    await syncGithub(env(db), new Date("2026-10-09T05:00:00Z"));
    expect(calls.length).toBe(2); // repos + heatmap (table empty)
    expect(log.filter((q) => q.sql.startsWith("INSERT INTO projects")).map((q) => q.args[0])).toEqual(["o/metalens", "o/bare"]);
    const ins = log.find((q) => q.sql.startsWith("INSERT INTO projects"))!;
    expect(ins.args[4]).toBe('["https://www.githubstatus.com"]'); // deps
    expect(ins.args[2]).toBe("https://metalens.example.dev"); // site
    expect(ins.args[15]).toBe("SUCCESS"); // ci_state
    expect(log.find((q) => q.sql.startsWith("DELETE FROM projects"))?.args).toEqual(["2026-10-09T05:00:00.000Z"]);
    expect(log.some((q) => q.sql.includes("ON CONFLICT(sha) DO UPDATE SET repo=excluded.repo") && q.args.length === 12)).toBe(true);
    expect(log.filter((q) => q.sql.startsWith("INSERT INTO languages")).length).toBe(1);
    expect(log.filter((q) => q.sql.startsWith("INSERT INTO totals_private")).map((q) => q.args)).toEqual([["Rust", 4000, "#dea584"], ["TypeScript", 1000, "#3178c6"]]);
    expect(log.find((q) => q.sql.includes("INTO private_agg"))?.args).toEqual([1, 33]);
    expect(log.filter((q) => q.sql.startsWith("INSERT INTO commits_daily")).length).toBe(3);
  });

  it("never lets a private repo name, message, url or topic reach D1", async () => {
    stubGql();
    const { db, log } = fakeDb();
    await syncGithub(env(db), new Date("2026-10-09T05:00:00Z"));
    const dump = JSON.stringify(log);
    for (const secret of ["secret-project-xyz", "secret commit message", "secret-site", "secret-dep", "secret-topic", "top secret description", "secret-v1", "/commit/s1"]) expect(dump).not.toContain(secret);
    expect(dump).toContain("metalens"); // sanity: public data does go through
  });

  it("works when the token has no private access (public only)", async () => {
    stubGql([nodes.filter((n) => !n.isPrivate)]);
    const { db, log } = fakeDb({ "COUNT(*)": [{ n: 5 }] });
    await syncGithub(env(db), new Date("2026-10-09T05:00:00Z"));
    expect(log.find((q) => q.sql.includes("INTO private_agg"))?.args).toEqual([0, 0]);
    expect(log.some((q) => q.sql.startsWith("INSERT INTO totals_private"))).toBe(false);
    expect(log.some((q) => q.sql.startsWith("INSERT INTO projects"))).toBe(true);
  });

  it("graphql failure throws before any write (no data loss)", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 502 }));
    const { db, log } = fakeDb();
    await expect(syncGithub(env(db))).rejects.toThrow("graphql 502");
    expect(log).toEqual([]);
    vi.stubGlobal("fetch", async () => ok({ errors: [{ message: "x" }] }));
    await expect(syncGithub(env(db))).rejects.toThrow("graphql errors");
    expect(log).toEqual([]);
    // partial data + errors must also throw before any write
    vi.stubGlobal("fetch", async () => ok({ errors: [{ message: "x" }], data: { viewer: { repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } }));
    await expect(syncGithub(env(db))).rejects.toThrow("graphql errors");
    expect(log).toEqual([]);
  });

  it("heatmap only daily (00 UTC) or when empty", async () => {
    const calls = stubGql();
    const { db } = fakeDb({ "COUNT(*)": [{ n: 5 }] });
    await syncGithub(env(db), new Date("2026-10-09T05:00:00Z"));
    expect(calls.some((c) => c.query.includes("contributionCalendar"))).toBe(false);
    await syncGithub(env(db), new Date("2026-10-09T00:00:00Z"));
    expect(calls.some((c) => c.query.includes("contributionCalendar"))).toBe(true);
  });

  it("pages (<= 3) and caps public repos at MAX_REPOS", async () => {
    const many = (p: number) => Array.from({ length: 50 }, (_, i) => ({ ...nodes[0], nameWithOwner: `o/r${p}-${i}`, name: `r${p}-${i}`, pushedAt: `2026-10-${String(10 + p).padStart(2, "0")}T00:00:${String(i).padStart(2, "0")}Z` }));
    const calls = stubGql([many(0), many(1), many(2), many(3)]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, log } = fakeDb({ "COUNT(*)": [{ n: 1 }] });
    await syncGithub(env(db), new Date("2026-10-09T05:00:00Z"));
    expect(calls.length).toBe(3);
    expect(log.filter((q) => q.sql.startsWith("INSERT INTO projects")).length).toBe(50);
    // hasNextPage still true after 3 pages: private aggregates are kept, not overwritten
    expect(log.some((q) => q.sql.includes("totals_private") || q.sql.includes("private_agg"))).toBe(false);
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
    const f = fakeDb({ commits_recent: [row] });
    const r = (await get("/api/commits", f.db))!;
    expect(await r.json()).toEqual([{ ...row, message: "feat" }]);
    expect(f.log[0].sql).toContain("PARTITION BY repo"); // newest few per repo, not a global top-N
    expect(f.log[0].args).toEqual([5, 60]);
  });
  it("null for other paths", async () => {
    expect(await get("/api/nope", fakeDb().db)).toBeNull();
  });
});
