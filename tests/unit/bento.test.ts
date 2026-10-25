import { describe, expect, it } from "vitest";
import type { Project, Stats, Status } from "../../src/web/api";
import { ageShort, incidentRepos, pickFeatured, pulseCounts, pulseReadout, pulseState } from "../../src/web/bento";
import { totalsItems } from "../../src/web/hero";
import { windowDays } from "../../src/web/heatmap";

const P = (o: Partial<Project>) => ({ repo: "o/a", name: "a", url: null, up: null, ci: null, ciState: null, uptime30d: null, pushedAt: null, featured: false, ...o }) as Project;
const NOW = Date.parse("2026-10-25T12:00:00Z");

describe("pulse status", () => {
  it("maps CI, uptime and incidents to ok / attn / wip", () => {
    expect(pulseState(P({ ciState: "SUCCESS" }))).toBe("ok");
    expect(pulseState(P({ up: true }))).toBe("ok");
    expect(pulseState(P({ ci: { status: "completed", conclusion: "success", url: "" } }))).toBe("ok");
    expect(pulseState(P({ ciState: "FAILURE" }))).toBe("attn");
    expect(pulseState(P({ ciState: "ERROR" }))).toBe("attn");
    expect(pulseState(P({ ci: { status: "completed", conclusion: "failure", url: "" } }))).toBe("attn");
    expect(pulseState(P({ ciState: "SUCCESS", up: false }))).toBe("attn");
    expect(pulseState(P({ ciState: "PENDING" }))).toBe("wip");
    expect(pulseState(P({}))).toBe("wip"); // nothing known
    expect(pulseState(P({ ciState: "SUCCESS", repo: "o/b" }), new Set(["o/b"]))).toBe("attn");
  });
  it("counts and open incidents", () => {
    const st = { sites: [{ name: "Site", repo: "o/b" }], incidents: [{ name: "Site", end: null }, { name: "Old", end: "x" }] } as unknown as Status;
    const open = incidentRepos(st);
    expect([...open]).toEqual(["o/b"]);
    const ps = [P({ ciState: "SUCCESS" }), P({ repo: "o/b", ciState: "SUCCESS" }), P({ ciState: "PENDING" })];
    expect(pulseCounts(ps, open)).toEqual({ ok: 1, attn: 1, wip: 1 });
    expect(incidentRepos(null).size).toBe(0);
  });
  it("readout and age", () => {
    const p = P({ name: "Alpha", url: "https://x.dev", up: true, uptime30d: 99.87, ciState: "SUCCESS", pushedAt: "2026-10-23T12:00:00Z" });
    expect(pulseReadout(p, NOW)).toBe("Alpha · CI success · up 99.8% · pushed 2d");
    expect(pulseReadout(P({ name: "B" }), NOW)).toBe("B · no CI");
    expect(pulseReadout(P({ name: "C", url: "https://x.dev", up: false }), NOW)).toContain("down");
    expect(ageShort("2026-10-25T11:30:00Z", NOW)).toBe("30m");
    expect(ageShort("2026-10-25T07:00:00Z", NOW)).toBe("5h");
    expect(ageShort("2026-10-01T00:00:00Z", NOW)).toBe("3w");
    expect(ageShort("2025-01-01T00:00:00Z", NOW)).toBe("1y");
    expect(ageShort(null, NOW)).toBe("");
  });
  it("featured: flagged first, else most recently pushed", () => {
    const a = P({ name: "a", pushedAt: "2026-10-01T00:00:00Z" }), b = P({ name: "b", pushedAt: "2026-10-20T00:00:00Z" }), c = P({ name: "c", featured: true, pushedAt: "2026-01-01T00:00:00Z" });
    expect(pickFeatured([a, b, c])?.name).toBe("c");
    expect(pickFeatured([a, b])?.name).toBe("b");
    expect(pickFeatured([])).toBeUndefined();
  });
});

describe("totals visibility", () => {
  it("hides zero/null figures and marks approximate ones", () => {
    const s = { contributionsThisYear: 5, approx: true, totals: { repos: 21, commits: 3450, loc: 0 } } as unknown as Stats;
    const t = totalsItems(s);
    expect(t.map((x) => x[0])).toEqual(["Repos", "Commits", "This year"]);
    expect(t[0][2](21)).toBe("21+");
    expect(t[1][2](3450)).toBe("≈3.5K");
    const exact = totalsItems({ contributionsThisYear: 0, approx: false, totals: { repos: 3, commits: 1200, loc: 123456 } } as unknown as Stats);
    expect(exact.map((x) => x[0])).toEqual(["Repos", "Commits", "Lines (est.)"]);
    expect(exact[2][2](123456)).toBe("123.5K");
    expect(totalsItems({} as Stats)).toEqual([]);
  });
});

describe("heat windowing", () => {
  const days = (n: number) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse("2026-01-01") + i * 864e5).toISOString().slice(0, 10), count: 1 }));
  it("starts on a Sunday, keeps the last day, at most 26 columns", () => {
    const w = windowDays(days(300), 26);
    expect(new Date(w[0].date + "T00:00:00Z").getUTCDay()).toBe(0);
    expect(w.at(-1)?.date).toBe(days(300).at(-1)?.date);
    expect(Math.ceil(w.length / 7)).toBeLessThanOrEqual(26);
    expect(windowDays(days(10), 26)).toHaveLength(10);
    expect(windowDays([], 26)).toEqual([]);
  });
});
