import { describe, expect, it } from "vitest";
import type { Project, Status } from "../../src/web/api";
import { bannerMessages, verdict } from "../../src/web/shell";

const proj = (o: Partial<Project>) => ({ repo: "o/a", name: "a", url: "https://a.dev", up: true, ci: null, ciState: "SUCCESS", ...o }) as Project;
const status = (incidents: Status["incidents"] = []): Status => ({ sites: [{ name: "a", repo: "o/a", url: "https://a.dev", up: true, uptime90d: 100, days: [] }], incidents });

describe("verdict", () => {
  it("all normal when everything is ok", () => {
    expect(verdict([proj({}), proj({ repo: "o/b", name: "b" })], status())).toMatchObject({ level: "ok", attention: 0, text: "All systems normal" });
  });
  it("counts CI failure, site down and open incident once per project", () => {
    const ps = [proj({ ciState: "FAILURE" }), proj({ repo: "o/b", name: "b", up: false }), proj({ repo: "o/c", name: "c" })];
    expect(verdict(ps, status([{ name: "a", start: "2026-01-01T00:00:00Z", end: null, status: 500 }])).attention).toBe(2);
    expect(verdict(ps, null).text).toBe("2 need attention");
    expect(verdict([ps[0]], null).text).toBe("1 needs attention");
  });
  it("ignores closed incidents and projects without CI or site", () => {
    expect(verdict([proj({}), proj({ repo: "o/x", name: "x", url: null, ciState: null, up: null })], status([{ name: "a", start: "x", end: "y", status: 500 }])).level).toBe("ok");
    expect(verdict([proj({ url: null, ciState: null, up: null })], null).level).toBe("none");
  });
});

describe("bannerMessages", () => {
  const now = Date.parse("2026-10-25T12:00:00Z");
  it("is empty when healthy", () => {
    expect(bannerMessages(undefined, now)).toEqual([]);
    expect(bannerMessages({ stale: false, since: null, tokenDaysLeft: 30 }, now)).toEqual([]);
  });
  it("reports stale data and token expiry", () => {
    const m = bannerMessages({ stale: true, since: "2026-10-25T09:00:00Z", tokenDaysLeft: 5 }, now);
    expect(m[0]).toMatch(/^Data is stale since 3 hr\. ago$/);
    expect(m[1]).toBe("GitHub token expires in 5 days");
    expect(bannerMessages({ stale: false, since: null, tokenDaysLeft: 1 }, now)).toEqual(["GitHub token expires in 1 day"]);
    expect(bannerMessages({ stale: false, since: null, tokenDaysLeft: 0 }, now)).toEqual(["GitHub token has expired"]);
  });
});
