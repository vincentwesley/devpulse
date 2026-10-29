import { afterEach, describe, expect, it, vi } from "vitest";
import page from "../fixtures/github/repos-graphql.json";
import calendar from "../fixtures/github/calendar.json";
import { isHttps, mapCalendar, mapDetail, mapList, parseDeps, parseHubMeta, type GqlDetail, type GqlRepo } from "../../src/worker/lib/github-parse";
import { MAX_LIST_PAGES } from "../../src/worker/config";
import { syncGithub } from "../../src/worker/github";
import { route } from "../../src/worker/routes/github";
import type { Env } from "../../src/worker/env";
import { fakeDb } from "./_db";

afterEach(() => vi.unstubAllGlobals());

const nodes = page.data.viewer.repositories.nodes as unknown as GqlRepo[];
const ok = (b: unknown) => new Response(JSON.stringify(b));

// Fixture nodes carry both list and detail fields; give them ids so the detail pass can address them.
const withIds = (ns: GqlRepo[]) => ns.map((n, i) => ({ ...n, id: (n as { id?: string }).id ?? `ID${i}` }));
const fx = withIds(nodes);
const detailOf = (n: any): GqlDetail => ({ id: n.id, nameWithOwner: n.nameWithOwner, isPrivate: !!n.isPrivate, object: n.object, readme: n.readme, defaultBranchRef: n.defaultBranchRef });

describe("parsers", () => {
  it("list: keeps archived public repos, drops private/ignored, newest push first", () => {
    const { pub } = mapList(fx);
    expect(pub.map((r) => r.full_name).sort()).toEqual(["o/bare", "o/metalens", "o/old"]);
    expect(pub.find((r) => r.full_name === "o/old")!.archived).toBe(true);
    expect(pub.map((r) => r.pushed_at)).toEqual([...pub.map((r) => r.pushed_at)].sort().reverse());
    expect(isHttps("ftp://x")).toBe(false);
  });
  it("list: maps the light fields", () => {
    const m = mapList(fx).pub.find((r) => r.full_name === "o/metalens")!;
    expect(m).toMatchObject({
      description: "VGC meta tool", language: "TypeScript", stars: 7, forks: 2, release_tag: "v1.4.0", license: "MIT", homepage: "https://metalens.example.dev",
      commit_count: 120, ci_state: "SUCCESS", topics: ["vgc"], langs: [{ lang: "TypeScript", bytes: 9000, color: "#3178c6" }, { lang: "CSS", bytes: 1000, color: "#663399" }],
    });
    expect(mapList(fx).pub.find((r) => r.full_name === "o/bare")).toMatchObject({ commit_count: 0, ci_state: null, langs: [] });
  });
  it("validates .devpulse.json", () => {
    expect(parseDeps('{"deps":["https://www.githubstatus.com"]}')).toEqual(["https://www.githubstatus.com"]);
    expect(parseDeps('{"deps":["http://insecure.com"]}')).toEqual([]);
    expect(parseDeps('{"deps":["javascript:alert(1)"]}')).toEqual([]);
    expect(parseDeps('{"deps":["https://ok.com","nope"]}')).toEqual([]);
    expect(parseDeps(`{"deps":${JSON.stringify(Array(11).fill("https://a.com"))}}`)).toEqual([]);
    expect(parseDeps("not json")).toEqual([]);
    expect(parseDeps('{"deps":"https://a.com"}')).toEqual([]);
    expect(parseHubMeta('{"site":"https://x.pages.dev","sheetId":"3D-22","kind":"extension"}')).toEqual({ site: "https://x.pages.dev", sheetId: "3D-22", kind: "extension" });
    expect(parseHubMeta('{"site":"http://x.dev","sheetId":"ml-09","kind":"app"}')).toEqual({ site: null, sheetId: null, kind: null });
    expect(parseHubMeta('{"site":"https://u:p@x.dev","sheetId":"TOOL-01"}')).toEqual({ site: null, sheetId: "TOOL-01", kind: null });
  });
  it("aggregates private repos without identifying data", () => {
    const { priv } = mapList(fx);
    expect(priv).toEqual({ repos: 1, commits: 33, langs: [{ lang: "Rust", bytes: 4000, color: "#dea584" }, { lang: "TypeScript", bytes: 1000, color: "#3178c6" }] });
  });
  it("detail: deps, commits, candidates, extension kind; oversized .devpulse.json is ignored", () => {
    const d = mapDetail(detailOf(fx[0]), "o", "acct");
    expect(d.deps).toEqual(["https://www.githubstatus.com"]);
    expect(d.commits.map((c) => [c.message, c.author])).toEqual([["feat: one", "vincentwesley"], ["fix: two", "Anon"]]);
    expect(d.site_cands.at(-1)).toEqual({ src: "pages", url: "https://o.github.io/metalens/" });
    const big = { ...detailOf(fx[0]), object: { text: JSON.stringify({ deps: ["https://a.com"], pad: "x".repeat(9000) }) } };
    expect(mapDetail(big, "o").deps).toEqual([]);
    expect(mapDetail({ ...detailOf(fx[0]), manifest: { text: '{"manifest_version":3}' } }, "o").kind).toBe("extension");
    expect(mapDetail({ ...detailOf(fx[0]), pkg: { text: '{"homepage":"https://o.github.io/metalens/"}' }, wjsonc: { text: '{ // c\n "name": "ml", "main": "src/i.ts", }' } }, "o", "acct").site_cands.map((c) => c.src)).toEqual(["package", "wrangler"]);
  });
  it("maps calendar", () => {
    expect(mapCalendar(calendar)).toEqual([
      { date: "2026-10-04", count: 0 }, { date: "2026-10-05", count: 3 }, { date: "2026-10-06", count: 7 },
    ]);
  });
});

/** GraphQL fake: calendar query, list pages (`pages` = nodes per page), nodes(ids) detail answered from the same fixtures. */
const stubGql = (pages: unknown[][] = [fx]) => {
  const calls: { query: string; variables: { after?: string | null; ids?: string[] } }[] = [];
  vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push(body);
    if (body.query.includes("contributionCalendar")) return ok(calendar);
    if (body.query.includes("nodes(ids")) { const all = pages.flat() as any[]; return ok({ data: { nodes: body.variables.ids.map((id: string) => { const n = all.find((x) => x.id === id); return n ? detailOf(n) : null; }) } }); }
    const i = body.variables.after ? Number(body.variables.after) : 0;
    return ok({ data: { viewer: { repositories: { pageInfo: { hasNextPage: i + 1 < pages.length, endCursor: String(i + 1) }, nodes: pages[i] } } } });
  });
  return calls;
};
const env = (db: D1Database, token = "t") => ({ DB: db, GITHUB_TOKEN: token, GITHUB_OWNER: "o" }) as unknown as Env;
const pubIds = () => fx.filter((n) => !n.isPrivate).map((n) => ({ repo: n.nameWithOwner, repo_id: n.id }));

describe("syncGithub", () => {
  it("skips without token", async () => {
    const calls = stubGql();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await syncGithub(env(fakeDb().db, ""));
    expect(calls).toEqual([]);
  });

  it("list + heatmap + detail write projects, languages, commits, private aggregates", async () => {
    const calls = stubGql();
    const { db, log } = fakeDb({ "detail_at IS NULL": pubIds() });
    await syncGithub(env(db), new Date("2026-10-09T05:00:00Z"));
    expect(calls.length).toBe(3); // list + heatmap (table empty) + one detail call
    expect(log.filter((q) => q.sql.startsWith("INSERT INTO projects")).map((q) => q.args[0])).toEqual(["o/metalens", "o/bare", "o/old"]);
    const ins = log.find((q) => q.sql.startsWith("INSERT INTO projects"))!;
    expect(ins.args.slice(4, 7)).toEqual(["https://metalens.example.dev", "https://metalens.example.dev", "website"]); // homepage, url, url_source
    expect(ins.args[20]).toBe("SUCCESS"); // ci_state
    expect(log.find((q) => q.sql.startsWith("DELETE FROM projects"))?.args).toEqual([JSON.stringify(["o/metalens", "o/bare", "o/old"])]);
    expect(log.some((q) => q.sql.includes("ON CONFLICT(sha) DO UPDATE SET repo=excluded.repo") && q.args.length === 12)).toBe(true);
    expect(log.find((q) => q.sql.startsWith("UPDATE projects SET probe_url"))!.args[1]).toBe('["https://www.githubstatus.com"]'); // deps (?2)
    expect(log.filter((q) => q.sql.startsWith("INSERT INTO languages")).length).toBe(1);
    expect(log.filter((q) => q.sql.startsWith("INSERT INTO totals_private")).map((q) => q.args)).toEqual([["Rust", 4000, "#dea584"], ["TypeScript", 1000, "#3178c6"]]);
    expect(log.find((q) => q.sql.includes("INTO private_agg"))?.args).toEqual([1, 33]);
    expect(log.filter((q) => q.sql.startsWith("INSERT INTO commits_daily")).length).toBe(3);
    expect(log.find((q) => q.sql.includes("'list_at'") || q.args[0] === "list_at")?.args[1]).toBe("2026-10-09T05:00:00.000Z");
  });

  it("never lets a private repo name, message, url or topic reach D1", async () => {
    stubGql();
    const { db, log } = fakeDb({ "detail_at IS NULL": pubIds() });
    await syncGithub(env(db), new Date("2026-10-09T05:00:00Z"));
    const dump = JSON.stringify(log);
    for (const secret of ["secret-project-xyz", "secret commit message", "secret-site", "secret-dep", "secret-topic", "top secret description", "secret-v1", "/commit/s1"]) expect(dump).not.toContain(secret);
    expect(dump).toContain("metalens"); // sanity: public data does go through
  });

  it("detail pass skips a repo that turned private after the list pass", async () => {
    stubGql();
    const priv = fx.find((n) => n.isPrivate)!;
    const { db, log } = fakeDb({ "detail_at IS NULL": [{ repo: priv.nameWithOwner, repo_id: priv.id }] });
    await syncGithub(env(db), new Date("2026-10-09T05:00:00Z"));
    expect(log.some((q) => q.sql.startsWith("UPDATE projects SET probe_url"))).toBe(false);
    expect(JSON.stringify(log)).not.toContain("secret commit message");
  });

  it("works when the token has no private access (public only)", async () => {
    stubGql([fx.filter((n) => !n.isPrivate)]);
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

  it("pages 100 at a time up to MAX_LIST_PAGES, keeps every public repo; a truncated list deletes nothing", async () => {
    const many = (p: number) => Array.from({ length: 100 }, (_, i) => ({ ...fx[0], id: `R${p}-${i}`, nameWithOwner: `o/r${p}-${i}`, name: `r${p}-${i}`, pushedAt: `2026-10-${String(10 + p).padStart(2, "0")}T00:00:${String(i % 60).padStart(2, "0")}Z` }));
    const calls = stubGql([many(0), many(1), many(2), many(3), many(4), many(5)]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { db, log } = fakeDb({ "COUNT(*)": [{ n: 1 }] });
    await syncGithub(env(db), new Date("2026-10-09T05:00:00Z"));
    expect(calls.filter((c) => c.query.includes("viewer{repositories")).length).toBe(MAX_LIST_PAGES);
    expect(log.filter((q) => q.sql.startsWith("INSERT INTO projects")).length).toBe(500);
    expect(log.some((q) => q.sql.startsWith("DELETE FROM projects"))).toBe(false);
    expect(log.some((q) => q.sql.includes("totals_private") || q.sql.includes("private_agg"))).toBe(false);
    expect(log.find((q) => q.args[0] === "list_truncated")?.args[1]).toBe("500");
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
