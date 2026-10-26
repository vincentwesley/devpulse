import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCodeFreq, syncLoc } from "../../src/worker/loc";
import type { Env } from "../../src/worker/env";
import { fakeDb } from "./_db";

afterEach(() => vi.unstubAllGlobals());

const week = (i: number, a: number, d: number) => [1700000000 + i * 604800, a, d];

describe("parseCodeFreq", () => {
  it("sums additions + |deletions| and keeps the last 26 weeks", () => {
    const rows = Array.from({ length: 30 }, (_, i) => week(i, 10, -5));
    const p = parseCodeFreq(rows)!;
    expect(p.loc).toBe(30 * 15);
    expect(p.series.length).toBe(26);
    expect(p.series[0]).toEqual([1700000000 + 4 * 604800, 10, 5]);
  });
  it("rejects malformed bodies", () => {
    expect(parseCodeFreq({})).toBeNull();
    expect(parseCodeFreq([[1, 2]])).toBeNull();
    expect(parseCodeFreq([[1, "a", 3]])).toBeNull();
    expect(parseCodeFreq([])).toEqual({ loc: 0, series: [] });
  });
});

describe("syncLoc", () => {
  const priv = (names: string[], hasNextPage = false) => ({ data: { viewer: { repositories: { pageInfo: { hasNextPage }, nodes: names.map((n) => ({ nameWithOwner: n, isArchived: false, repositoryTopics: { nodes: [] } })) } } } });
  /** status per repo path; default 200 with 2 weeks of data. */
  const run = async (status: Record<string, number>, privNames = ["o/secret-project-xyz"], pubs = ["o/pub", "o/pub2"], now?: Date, hasNext = false) => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(u);
      if (u.endsWith("/graphql")) return new Response(JSON.stringify(priv(privNames, hasNext)));
      const repo = /repos\/(.+)\/stats/.exec(u)![1];
      const s = status[repo] ?? 200;
      return s === 200 ? new Response(JSON.stringify([week(0, 100, -40), week(1, 10, -5)])) : new Response(null, { status: s });
    });
    const { db, log } = fakeDb({ "FROM projects": pubs.map((repo) => ({ repo })) });
    await syncLoc({ DB: db, GITHUB_TOKEN: "t", GITHUB_OWNER: "o" } as unknown as Env, now);
    return { log, urls, stats: urls.filter((u) => u.includes("stats/")).map((u) => /repos\/(.+)\/stats/.exec(u)![1]) };
  };
  const loc = (log: { sql: string; args: unknown[] }[]) => log.filter((q) => q.sql.startsWith("UPDATE projects SET loc")).map((q) => q.args);
  const agg = (log: { sql: string; args: unknown[] }[]) => log.find((q) => q.sql.includes("INTO private_agg"))?.args;

  it("200: stores loc + series for public, aggregate for private", async () => {
    const { log, urls } = await run({});
    expect(loc(log)).toEqual([[155, "o/pub"], [155, "o/pub2"]]);
    expect(log.filter((q) => q.sql.startsWith("INSERT INTO code_freq")).length).toBe(2);
    expect(JSON.parse(log.find((q) => q.sql.startsWith("INSERT INTO code_freq"))!.args[1] as string)).toEqual([[1700000000, 100, 40], [1700604800, 10, 5]]);
    expect(agg(log)).toEqual([155]);
    expect(urls.length).toBe(4); // 1 list + 3 stats
  });
  it("202 keeps the old public value and blocks the private aggregate", async () => {
    const { log } = await run({ "o/pub": 202, "o/secret-project-xyz": 202 });
    expect(loc(log)).toEqual([[155, "o/pub2"]]);
    expect(agg(log)).toBeUndefined();
  });
  it("422 marks a public repo 0 (final); a private 422 counts as 0 but does not block", async () => {
    const { log } = await run({ "o/pub": 422, "o/secret-project-xyz": 422 });
    expect(loc(log)).toEqual([["o/pub"], [155, "o/pub2"]]); // public 422 is final: loc=0 so it is never retried
    expect(agg(log)).toEqual([0]);
  });
  it("other errors skip public and keep the private aggregate", async () => {
    const { log } = await run({ "o/pub2": 500, "o/secret-project-xyz": 403 });
    expect(loc(log)).toEqual([[155, "o/pub"]]);
    expect(agg(log)).toBeUndefined();
  });
  it("no private repos -> aggregate set to 0", async () => {
    const { log } = await run({}, []);
    expect(agg(log)).toEqual([0]);
  });
  it("private names never reach D1", async () => {
    const { log } = await run({});
    expect(JSON.stringify(log)).not.toContain("secret-project-xyz");
  });
  it("404/204 on a private repo count as 0 and do not block", async () => {
    expect(agg((await run({ "o/secret-project-xyz": 404 })).log)).toEqual([0]);
    expect(agg((await run({ "o/secret-project-xyz": 204 })).log)).toEqual([0]);
  });
  it("over-quota private list (>10) is not sampled; old aggregate kept; budget goes to public", async () => {
    const { log, urls } = await run({}, Array.from({ length: 11 }, (_, i) => `o/p${i}`), Array.from({ length: 60 }, (_, i) => `o/u${i}`));
    expect(agg(log)).toBeUndefined();
    expect(urls.length).toBe(46); // 1 list + 45 public
  });
  it("private list with hasNextPage keeps the old aggregate", async () => {
    expect(agg((await run({}, ["o/a"], ["o/pub"], undefined, true)).log)).toBeUndefined();
  });
  it("rotates public repos by day so all get covered; stays <= 45 + 1 calls", async () => {
    const pubs = Array.from({ length: 60 }, (_, i) => `o/u${i}`);
    const seen = new Set<string>();
    for (const d of [1, 2, 3]) {
      const r = await run({}, [], pubs, new Date(Date.UTC(2026, 0, d)));
      expect(r.urls.length).toBe(46);
      r.stats.forEach((x) => seen.add(x));
    }
    expect(seen.size).toBe(60);
  });
});
