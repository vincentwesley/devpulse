import { afterEach, describe, expect, it, vi } from "vitest";
import { runScheduled } from "../../src/worker/cron";
import { retryLoc } from "../../src/worker/loc";
import type { Env } from "../../src/worker/env";
import { sqliteDb } from "./_sqlite";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const T0 = Date.parse("2026-10-05T01:15:00Z");
const min = (n: number) => new Date(T0 + n * 60_000);
const rows = (raw: any, sql: string) => (raw.prepare(sql).all() as object[]).map((r) => ({ ...r }));
const mk = (n: number, privNames: string[] = []) => {
  const s = sqliteDb();
  for (let i = 0; i < n; i++) s.raw.prepare("INSERT INTO projects (repo,name,pushed_at,updated_at) VALUES (?,?,?,?)").run(`o/r${i}`, `r${i}`, `2026-10-0${1 + (i % 5)}T00:00:00Z`, "x");
  s.raw.prepare("INSERT INTO private_agg (id,loc) VALUES (1,7)").run();
  const calls: string[] = [];
  const state = { ready: new Set<string>() }; // GitHub: first request computes (202), later ones answer 200
  vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
    if (u.endsWith("/graphql")) return new Response(JSON.stringify({ data: { viewer: { repositories: { pageInfo: { hasNextPage: false }, nodes: privNames.map((nameWithOwner) => ({ nameWithOwner, isArchived: false, repositoryTopics: { nodes: [] } })) } } } }));
    const repo = /repos\/(.+)\/stats/.exec(u)![1];
    calls.push(repo);
    if (!state.ready.has(repo)) { state.ready.add(repo); return new Response(null, { status: 202 }); }
    return new Response(JSON.stringify([[1700000000, 10, -5]]));
  });
  return { ...s, env: { DB: s.db, GITHUB_TOKEN: "t", GITHUB_OWNER: "o" } as unknown as Env, calls, state, init: undefined };
};
const nullLoc = (raw: any) => rows(raw, "SELECT repo FROM projects WHERE loc IS NULL").length;

describe("retryLoc", () => {
  it("live mimic: every repo 202 first -> converges over a few slots, <= 4 fetches per slot, no repo twice within 10 min", async () => {
    const { env, raw, calls } = mk(6);
    const attempts = new Map<string, number>();
    let t = 0;
    for (let slot = 0; slot < 12 && nullLoc(raw); slot++, t += 15) {
      calls.length = 0;
      await retryLoc(env, min(t));
      expect(calls.length).toBeLessThanOrEqual(4);
      for (const r of calls) { const last = attempts.get(r); if (last !== undefined) expect(t - last).toBeGreaterThanOrEqual(10); attempts.set(r, t); }
    }
    expect(nullLoc(raw)).toBe(0);
    expect(rows(raw, "SELECT loc FROM projects").every((r: any) => r.loc === 15)).toBe(true);
    expect(rows(raw, "SELECT COUNT(*) AS n FROM code_freq")).toEqual([{ n: 6 }]);
  });

  it("does not hammer: a second run inside 10 minutes only touches repos not yet attempted; never-attempted go first", async () => {
    const { env, raw, calls } = mk(6);
    await retryLoc(env, min(0));
    const first = [...calls];
    expect(first.length).toBe(4);
    calls.length = 0;
    await retryLoc(env, min(5));
    expect(calls.sort()).toEqual(["o/r0", "o/r1", "o/r2", "o/r3", "o/r4", "o/r5"].filter((r) => !first.includes(r)).sort()); // only the 2 never-tried, no private/extra fetch
    calls.length = 0;
    await retryLoc(env, min(7));
    expect(calls.length).toBe(0); // all 6 attempted within 10 min and private list is a separate (later) step
  });

  it("public 204/404/422 are final (loc=0) and are not retried", async () => {
    const { env, raw, calls } = mk(1);
    vi.stubGlobal("fetch", async () => new Response(null, { status: 422 }));
    await retryLoc(env, min(0));
    expect(rows(raw, "SELECT loc FROM projects")).toEqual([{ loc: 0 }]);
    expect(calls.length).toBe(0);
  });

  it("private aggregate completes only when every private repo answered; then stops for the day", async () => {
    const { env, raw, calls, state } = mk(0, ["o/p1", "o/p2"]);
    await retryLoc(env, min(0)); // both 202
    expect(rows(raw, "SELECT loc FROM private_agg")).toEqual([{ loc: 7 }]); // old aggregate kept
    state.ready.add("o/p1"); // p1 now answers 200, p2 still computing
    state.ready.delete("o/p2");
    await retryLoc(env, min(5)); // inside the 10 min gap: nothing
    expect(calls).toEqual(["o/p1", "o/p2"]);
    await retryLoc(env, min(11)); // p1 200, p2 202 -> incomplete
    expect(rows(raw, "SELECT loc FROM private_agg")).toEqual([{ loc: 7 }]);
    expect(rows(raw, "SELECT value FROM meta WHERE key='loc_priv_done'")).toEqual([]);
    await retryLoc(env, min(22)); // both 200
    expect(rows(raw, "SELECT loc FROM private_agg")).toEqual([{ loc: 30 }]);
    expect(rows(raw, "SELECT value FROM meta WHERE key='loc_priv_done'")).toEqual([{ value: "2026-10-05" }]);
    calls.length = 0;
    await retryLoc(env, min(40));
    expect(calls.length).toBe(0);
    expect(JSON.stringify(rows(raw, "SELECT * FROM meta"))).not.toContain("p1");
  });

  it("a private list too big for a retry (>3) is left to the daily pass: no stats fetches", async () => {
    const { env, calls } = mk(0, ["o/a", "o/b", "o/c", "o/d"]);
    await retryLoc(env, min(0));
    expect(calls.length).toBe(0);
  });
});

describe("cron order", () => {
  it("uptime runs after the GitHub sync, so it records under the new name after a rename", async () => {
    const { env, raw } = mk(0);
    raw.prepare("INSERT INTO projects (repo,name,url,repo_id,updated_at) VALUES ('o/old','old','https://site.test','A','x')").run();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
      if (u.endsWith("/graphql")) {
        const q = JSON.parse(init!.body as string).query as string;
        if (q.includes("contributionCalendar")) return new Response(JSON.stringify({ data: { user: { contributionsCollection: { contributionCalendar: { weeks: [] } } } } }));
        const node = { id: "A", nameWithOwner: "o/new", name: "new", isPrivate: false, isArchived: false, pushedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", homepageUrl: "https://site.test", repositoryTopics: { nodes: [] }, languages: { edges: [] }, defaultBranchRef: null };
        return new Response(JSON.stringify({ data: { viewer: { repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [node] } } } }));
      }
      return new Response("ok");
    });
    await runScheduled({ scheduledTime: Date.parse("2026-10-05T03:15:00Z") } as ScheduledController, env);
    expect(rows(raw, "SELECT DISTINCT project FROM checks")).toEqual([{ project: "o/new" }]);
    expect(rows(raw, "SELECT project FROM uptime_summary")).toEqual([{ project: "o/new" }]);
  });
});
