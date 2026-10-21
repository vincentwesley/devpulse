import { afterEach, describe, expect, it, vi } from "vitest";
import { isoWeek, parsePsi, runPsi } from "../../src/worker/psi";
import type { Env } from "../../src/worker/env";
import { fakeDb } from "./_db";

afterEach(() => vi.unstubAllGlobals());

const psi = (s: [number, number, number, number]) => ({
  lighthouseResult: { categories: { performance: { score: s[0] }, accessibility: { score: s[1] }, "best-practices": { score: s[2] }, seo: { score: s[3] } } },
});

describe("parsePsi", () => {
  it("scales 0..1 to 0..100", () => {
    expect(parsePsi(psi([0.954, 1, 0.725, 0.4]))).toEqual({ performance: 95, accessibility: 100, best_practices: 73, seo: 40 });
  });
  it("rejects missing or out-of-range categories", () => {
    expect(parsePsi(null)).toBeNull();
    expect(parsePsi({})).toBeNull();
    expect(parsePsi(psi([0.9, 1, 1, 2]))).toBeNull();
    expect(parsePsi({ lighthouseResult: { categories: { performance: { score: null } } } })).toBeNull();
  });
});

describe("isoWeek", () => {
  it("matches ISO weeks", () => {
    expect(isoWeek(new Date("2026-10-05T01:00:00Z"))).toBe("2026-W41");
    expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(isoWeek(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });
});

describe("runPsi", () => {
  it("one mobile call per site with 4 categories + key, upserts, skips failures", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(u);
      return u.includes("bad.test") ? new Response("", { status: 429 }) : new Response(JSON.stringify(psi([0.9, 1, 0.8, 0.7])));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, log } = fakeDb({ "FROM projects": [{ repo: "o/a", url: "https://a.test" }, { repo: "o/b", url: "https://bad.test" }] });
    await runPsi({ DB: db, PSI_KEY: "k3y" } as unknown as Env, new Date("2026-10-05T01:00:00Z"));
    expect(urls.length).toBe(2);
    const u = new URL(urls.find((x) => x.includes("a.test"))!);
    expect(u.origin + u.pathname).toBe("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    expect(u.searchParams.get("url")).toBe("https://a.test");
    expect(u.searchParams.get("strategy")).toBe("mobile");
    expect(u.searchParams.getAll("category")).toEqual(["performance", "accessibility", "best-practices", "seo"]);
    expect(u.searchParams.get("key")).toBe("k3y");
    const ups = log.filter((q) => q.sql.startsWith("INSERT INTO lighthouse"));
    expect(ups.map((q) => q.args)).toEqual([["o/a", "2026-W41", 90, 100, 80, 70]]);
  });
  it("omits key when PSI_KEY unset", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => (urls.push(u), new Response(JSON.stringify(psi([1, 1, 1, 1])))));
    await runPsi({ DB: fakeDb({ "FROM projects": [{ repo: "o/a", url: "https://a.test" }] }).db } as unknown as Env);
    expect(urls[0]).not.toContain("key=");
  });
});
