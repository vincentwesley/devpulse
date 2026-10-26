import { describe, expect, it } from "vitest";
import { computeStats } from "../../src/worker/lib/stats";
import { route } from "../../src/worker/routes/stats";
import type { Env } from "../../src/worker/env";
import { fakeDb } from "./_db";

// 2026-10-05 is a Monday.
const days = (start: string, counts: number[]) => counts.map((count, i) => ({ date: new Date(Date.parse(start + "T00:00:00Z") + i * 864e5).toISOString().slice(0, 10), count }));
const NOW = new Date("2026-10-09T12:00:00Z"); // Friday

describe("computeStats", () => {
  it("current + longest streak, today still empty keeps the streak", () => {
    const d = days("2026-10-01", [1, 1, 1, 1, 0, 2, 3, 1, 4]); // Oct1..Oct9
    expect(computeStats(d, NOW).streak).toEqual({ current: 4, longest: 4 });
    const noToday = days("2026-10-01", [1, 1, 1, 1, 0, 2, 3, 1, 0]);
    expect(computeStats(noToday, NOW).streak).toEqual({ current: 3, longest: 4 });
  });
  it("broken yesterday and today -> current 0", () => {
    expect(computeStats(days("2026-10-01", [1, 1, 1, 1, 1, 1, 1, 0, 0]), NOW).streak).toEqual({ current: 0, longest: 7 });
  });
  it("stale data (last day older than yesterday) -> current 0", () => {
    expect(computeStats(days("2026-09-20", [1, 1, 1]), NOW).streak.current).toBe(0);
  });
  it("ignores future days", () => {
    expect(computeStats(days("2026-10-08", [1, 1, 9, 9]), NOW).streak).toEqual({ current: 2, longest: 2 });
  });
  it("busiest weekday + totals (Sunday first) + this year", () => {
    const d = [...days("2025-12-29", [100, 0, 0]), ...days("2026-10-05", [5, 1, 0, 2, 0])]; // 2025-12-29 is a Monday
    const s = computeStats(d, NOW);
    expect(s.busiestWeekday).toBe("Monday");
    expect(s.weekdayTotals).toEqual([0, 105, 1, 0, 2, 0, 0]);
    expect(s.contributionsThisYear).toBe(8); // 2025 days excluded
  });
  it("empty input", () => {
    expect(computeStats([], NOW)).toMatchObject({ streak: { current: 0, longest: 0 }, busiestWeekday: null, contributionsThisYear: 0 });
  });
});

describe("routes", () => {
  const get = (p: string, rows: Record<string, unknown[]>) => route(new Request("http://x" + p), { DB: fakeDb(rows).db } as Env, p);

  it("/api/stats: totals add private aggregates, shape", async () => {
    const r = (await get("/api/stats", {
      "FROM commits_daily": days("2026-10-01", [1, 1, 1]),
      "FROM commits_recent": [{ repo: "o/a", name: "a", commits: 4 }],
      "SUM(loc)": [{ repos: 2, commits: 100, loc: 5000, synced: "2026-10-05T10:00:00.000Z" }],
      "FROM private_agg": [{ repos: 3, commit_count: 40, loc: 900 }],
    }))!;
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=60"); // health rides along: short cache keeps the stale banner fresh
    const b = (await r.json()) as any;
    expect(b.totals).toEqual({ repos: 5, commits: 140, loc: 6000 }); // private included: commits to 10, loc to 1000
    expect(b.approx).toBe(true);
    expect(b.mostActive30d).toEqual({ repo: "o/a", name: "a", commits: 4 });
    expect(Object.keys(b).sort()).toEqual(["approx", "busiestWeekday", "contributionsThisYear", "health", "mostActive30d", "streak", "syncedAt", "totals", "weekdayTotals"]);
  });
  it("/api/stats with no data is all zeros / null", async () => {
    const b = (await (await get("/api/stats", {}))!.json()) as any;
    expect(b.totals).toEqual({ repos: 0, commits: 0, loc: 0 });
    expect(b.approx).toBe(false);
    expect(b.syncedAt).toBeNull();
    expect(b.mostActive30d).toBeNull();
  });
  it("/api/languages: combined only with percentages and colours", async () => {
    const r = (await get("/api/languages", {
      "FROM languages": [{ lang: "TypeScript", bytes: 900, color: "#3178c6" }, { lang: "CSS", bytes: 100, color: "#663399" }],
      "FROM totals_private": [{ lang: "Rust", bytes: 1000, color: "#dea584" }, { lang: "CSS", bytes: 1000, color: null }],
    }))!;
    const b = (await r.json()) as any;
    expect(Object.keys(b)).toEqual(["all"]); // no public-only list: it would let a diff reveal private bytes
    expect(b.all.map((l: any) => [l.lang, l.pct, l.color])).toEqual([["CSS", 36.7, "#663399"], ["Rust", 33.3, "#dea584"], ["TypeScript", 30, "#3178c6"]]);
  });
  it("other paths -> null", async () => {
    expect(await get("/api/nope", {})).toBeNull();
  });
});
