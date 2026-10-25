import { describe, expect, it } from "vitest";
import { commitsFor, dayClass, fmtPct, fuzzy, openIncidentRepos, plural, rankBy, relTime, rowState, safeColor, sortFilter } from "../../src/web/hubutil";
import type { Commit, Project, Status } from "../../src/web/api";

const P = (o: Partial<Project>) => ({ repo: "o/x", name: "x", up: null, stars: 0, language: null, pushedAt: null, ...o }) as Project;

describe("hub helpers", () => {
  it("relTime", () => {
    const now = Date.parse("2026-10-20T00:00:00Z");
    expect(relTime("2026-10-17T00:00:00Z", now)).toMatch(/3.*ago/);
    expect(relTime("2026-10-19T23:59:50Z", now)).toBe("just now");
    expect(relTime(null)).toBe("");
    expect(relTime("nope")).toBe("");
  });
  it("safeColor", () => {
    expect(safeColor("#AbC123")).toBe("#AbC123");
    expect(safeColor("red; x:y")).toBe("var(--accent)");
    expect(safeColor(null)).toBe("var(--accent)");
  });
  it("sort + filter", () => {
    const ps = [
      P({ name: "b", stars: 5, language: "TS", up: true, pushedAt: "2026-10-01T00:00:00Z" }),
      P({ name: "a", stars: 9, language: "Go", up: false, pushedAt: "2026-10-10T00:00:00Z" }),
      P({ name: "c", stars: 1, language: "TS" }),
    ];
    const names = (s: Parameters<typeof sortFilter>[1], l = "", st: Parameters<typeof sortFilter>[3] = "all") => sortFilter([...ps], s, l, st).map((p) => p.name);
    expect(names("active")).toEqual(["a", "b", "c"]);
    expect(names("stars")).toEqual(["a", "b", "c"]);
    expect(names("name")).toEqual(["a", "b", "c"]);
    expect(names("status")).toEqual(["a", "c", "b"]); // attention, no signal, healthy
    expect(names("lang")).toEqual(["a", "b", "c"]);
    expect(names("name", "TS")).toEqual(["b", "c"]);
    expect(names("name", "", "live")).toEqual(["b"]);
    expect(names("name", "", "failing")).toEqual(["a"]);
    expect(names("name", "", "wip")).toEqual(["c"]);
  });
  it("rowState: failures, incidents, pending, healthy, none", () => {
    expect(rowState(P({ ciState: "FAILURE" }))).toBe("attn");
    expect(rowState(P({ up: false }))).toBe("attn");
    expect(rowState(P({ repo: "o/x" }), new Set(["o/x"]))).toBe("attn");
    expect(rowState(P({ ciState: "PENDING", up: true }))).toBe("wip");
    expect(rowState(P({ up: true }))).toBe("ok");
    expect(rowState(P({ ciState: "SUCCESS" }))).toBe("ok");
    expect(rowState(P({}))).toBe("none");
  });
  it("openIncidentRepos + dayClass + fmtPct", () => {
    const st = { sites: [{ name: "S", repo: "o/s" }], incidents: [{ name: "S", end: null }, { name: "T", end: "x" }] } as unknown as Status;
    expect([...openIncidentRepos(st)]).toEqual(["o/s"]);
    expect(dayClass({ up: 96, total: 96 })).toEqual({ pct: 100, cls: "ok" });
    expect(dayClass({ up: 92, total: 96 }).cls).toBe("warn");
    expect(dayClass({ up: 50, total: 96 }).cls).toBe("bad");
    expect(dayClass({ up: 0, total: 0 })).toEqual({ pct: null, cls: "none" });
    expect(fmtPct(99.999)).toBe("99.99%");
  });
  it("commitsFor", () => {
    const c = (repo: string, ts: string) => ({ repo, ts }) as Commit;
    const out = commitsFor(P({ repo: "o/x", name: "X" }), [c("x", "1"), c("o/x", "2"), c("y", "3")]);
    expect(out.map((k) => k.ts)).toEqual(["2", "1"]);
  });
  it("sort + filter by query and topic", () => {
    const ps = [P({ name: "Alpha", topics: ["vite"], description: "a tool" }), P({ name: "Beta", topics: ["go"], description: null })];
    expect(sortFilter([...ps], "name", "", "all", "ALP").map((p) => p.name)).toEqual(["Alpha"]);
    expect(sortFilter([...ps], "name", "", "all", "", "go").map((p) => p.name)).toEqual(["Beta"]);
    expect(sortFilter([...ps], "name", "", "all", "tool", "go")).toEqual([]);
  });
  it("plural", () => {
    expect(plural(1, "star")).toBe("1 star");
    expect(plural(0, "fork")).toBe("0 forks");
    expect(plural(12345, "commit")).toBe("12,345 commits");
  });
  it("fuzzy", () => {
    expect(fuzzy("zz", "alpha")).toBeNull();
    expect(fuzzy("", "alpha")).toBe(0);
    expect(fuzzy("alp", "Alpha")!).toBeGreaterThan(fuzzy("apa", "Alpha")!);
    expect(rankBy(["Toggle theme", "Status", "Posts"], "st", (x) => x)).toEqual(["Status", "Posts"]);
    expect(rankBy(["b", "a"], "", (x) => x)).toEqual(["b", "a"]);
  });
});
