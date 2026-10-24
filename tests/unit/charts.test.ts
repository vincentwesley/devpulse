import { describe, expect, it } from "vitest";
import { dayPct, fmtDuration, fmtPct, lastBars, windowPct } from "../../src/web/status";
import { groupByDay } from "../../src/web/activity";
import { heroTiles } from "../../src/web/hero";
import { windowDays } from "../../src/web/heatmap";
import type { Commit, Stats } from "../../src/web/api";

const days = (n: number, start = "2026-01-01") =>
  Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(start) + i * 864e5).toISOString().slice(0, 10), count: i % 3 }));

describe("charts helpers", () => {
  it("heatmap windows to at most 26 week columns, ends on the last day", () => {
    const all = days(365);
    const w = windowDays(all, 26);
    const first = new Date(w[0].date + "T00:00:00Z").getUTCDay();
    expect(w.at(-1)).toBe(all.at(-1));
    expect(first).toBe(0); // Sunday-aligned
    expect(Math.ceil(w.length / 7)).toBeLessThanOrEqual(26);
    expect(windowDays(days(10), 26)).toHaveLength(10);
  });
  it("status bars and uptime", () => {
    const ds = days(90);
    const d = ds.map((x, i) => ({ date: x.date, up: 96, total: i === 5 ? 0 : 96 }));
    expect(lastBars(d, 30)).toHaveLength(30);
    expect(lastBars(d, 30).at(-1)).toBe(d[89]);
    expect(dayPct(d[5])).toBeNull();
    expect(dayPct({ date: "x", up: 95, total: 96 })).toBeCloseTo(98.96, 1);
    expect(windowPct([{ date: "a", up: 1, total: 2 }, { date: "b", up: 1, total: 2 }])).toBe(50);
    expect(windowPct([])).toBeNull();
    expect(fmtPct(100)).toBe("100%");
    expect(fmtPct(99.999)).toBe("99.99%");
  });
  it("incident duration", () => {
    const s = "2026-10-01T10:00:00Z";
    expect(fmtDuration(s, "2026-10-01T10:12:00Z")).toBe("12 min");
    expect(fmtDuration(s, "2026-10-01T12:05:00Z")).toBe("2 h 5 min");
    expect(fmtDuration(s, "2026-10-02T13:00:00Z")).toBe("1 d 3 h");
    expect(fmtDuration(s, null, Date.parse(s) + 6e4)).toBe("ongoing, 1 min");
  });
  it("activity groups by day", () => {
    const c = (ts: string) => ({ ts }) as Commit;
    const g = groupByDay([c("2026-10-02T09:00:00Z"), c("2026-10-02T01:00:00Z"), c("2026-10-01T01:00:00Z")]);
    expect(g.map(([k, v]) => [k, v.length])).toEqual([["2026-10-02", 2], ["2026-10-01", 1]]);
  });
  it("hero hides zero/null stats and marks approx", () => {
    const s = { streak: { current: 0, longest: 0 }, contributionsThisYear: 5, mostActive30d: null, approx: true, totals: { repos: 21, commits: 3450, loc: 0 } } as unknown as Stats;
    const t = heroTiles(s);
    expect(t.map((x) => x[0])).toEqual(["repos (public + private)", "commits", "contributions this year"]);
    expect(t[0][2](21)).toBe("21+");
    expect(t[1][2](3450)).toBe("≈3.5K");
  });
});
