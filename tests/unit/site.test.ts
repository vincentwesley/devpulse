import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanUrl, nextProbe, parseWranglerToml, readmeSite, siteCandidates, stripJsonc, websiteUrl, wranglerUrls, parseWranglerJson } from "../../src/worker/lib/site";
import { runProbes } from "../../src/worker/sites";
import type { Env } from "../../src/worker/env";
import { sqliteDb } from "./_sqlite";

afterEach(() => vi.unstubAllGlobals());

describe("site discovery (pure)", () => {
  it("Website field: https only, never a github.com page, no credentials", () => {
    expect(websiteUrl("https://metalensvgc.pages.dev")).toBe("https://metalensvgc.pages.dev");
    expect(websiteUrl("https://github.com/vincentwesley/earth-through-time")).toBeNull();
    expect(websiteUrl("http://x.dev")).toBeNull();
    expect(websiteUrl("https://u:p@x.dev")).toBeNull();
    expect(cleanUrl(" https://x.dev/ ")).toBe("https://x.dev/");
    expect(cleanUrl("https://x.dev/" + "a".repeat(300))).toBeNull();
  });
  it("jsonc: comments outside strings and trailing commas", () => {
    const t = '{\n // name\n "name": "devpulse", /* x */ "url": "https://a//b", "main": "src/i.ts",\n}';
    expect(JSON.parse(stripJsonc(t))).toEqual({ name: "devpulse", url: "https://a//b", main: "src/i.ts" });
  });
  it("wrangler: custom domain, then pages.dev or <name>.<sub>.workers.dev", () => {
    expect(wranglerUrls(parseWranglerJson('{"name":"devpulse","main":"src/w.ts"}'), "vwesley")).toEqual(["https://devpulse.vwesley.workers.dev"]);
    expect(wranglerUrls(parseWranglerJson('{"name":"devpulse","main":"src/w.ts","workers_dev":false}'), "vwesley")).toEqual([]);
    expect(wranglerUrls(parseWranglerJson('{"name":"site","assets":{"directory":"dist"}}'), "vwesley")).toEqual(["https://site.vwesley.workers.dev"]);
    expect(wranglerUrls(parseWranglerJson('{"name":"ml","pages_build_output_dir":"dist"}'))).toEqual(["https://ml.pages.dev"]);
    expect(wranglerUrls(parseWranglerJson('{"name":"x","main":"a","routes":[{"pattern":"app.vwesley.dev","custom_domain":true},{"pattern":"z.dev/*","zone_name":"z.dev"}]}'), "s")).toEqual(["https://app.vwesley.dev", "https://x.s.workers.dev"]);
    expect(wranglerUrls(parseWranglerToml('name = "tw"\nmain = "src/index.ts"\n[vars]\nname = "nope"'), "s")).toEqual(["https://tw.s.workers.dev"]);
    expect(wranglerUrls(parseWranglerToml('name = "pg"\npages_build_output_dir = "./dist"'))).toEqual(["https://pg.pages.dev"]);
  });
  it("README: first pages.dev / workers.dev / own github.io link", () => {
    expect(readmeSite("See [demo](https://vincentwesley.github.io/koi-pond/).", "vincentwesley", "koi-pond")).toBe("https://vincentwesley.github.io/koi-pond/");
    expect(readmeSite("Live at https://metalensvgc.pages.dev**.", "o", "x")).toBe("https://metalensvgc.pages.dev");
    expect(readmeSite("https://someone.github.io/other/ and https://github.com/o/x", "o", "x")).toBeNull();
  });
  it("candidates: ordered, de-duplicated, GitHub Pages guess last", () => {
    const c = siteCandidates({ owner: "VincentWesley", name: "black-hole", devpulseSite: null, pkg: '{"homepage":"https://vincentwesley.github.io/black-hole/"}', readme: "https://vincentwesley.github.io/black-hole/" });
    expect(c).toEqual([{ src: "package", url: "https://vincentwesley.github.io/black-hole/" }]);
    expect(siteCandidates({ owner: "o", name: "x", devpulseSite: "https://x.dev", wranglerJsonc: '{"name":"x","main":"m"}', workersSub: "s" }).map((x) => x.src)).toEqual(["devpulse", "wrangler", "pages"]);
  });
  it("probe state: first candidate, fall through on failure, stop when verified, retry the list after the window", () => {
    const c = [{ src: "readme" as const, url: "https://a.pages.dev" }, { src: "pages" as const, url: "https://o.github.io/x/" }];
    expect(nextProbe(c, null, null, null, 100, 10)).toBe(c[0]);
    expect(nextProbe(c, c[0].url, 0, 99, 100, 10)).toBe(c[1]);
    expect(nextProbe(c, c[1].url, 0, 99, 100, 10)).toBeNull();
    expect(nextProbe(c, c[1].url, 0, 80, 100, 10)).toBe(c[0]);
    expect(nextProbe(c, c[0].url, 1, 99, 1e9, 10)).toBeNull();
    expect(nextProbe([], null, null, null, 0, 10)).toBeNull();
  });
});

describe("runProbes", () => {
  it("verifies candidates in order, never overrides a Website url, clears url when every candidate failed", async () => {
    const { db, raw } = sqliteDb();
    const cands = (u: string[]) => JSON.stringify(u.map((url, i) => ({ src: i ? "pages" : "readme", url })));
    raw.prepare("INSERT INTO projects (repo,name,site_cands) VALUES ('o/a','a',?), ('o/b','b',?)").run(cands(["https://a.pages.dev", "https://o.github.io/a/"]), cands(["https://dead.pages.dev"]));
    raw.prepare("INSERT INTO projects (repo,name,url,url_source,site_cands) VALUES ('o/w','w','https://w.dev','website',?)").run(cands(["https://w.pages.dev"]));
    const hits: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => { hits.push(u); return new Response("", { status: u.includes("github.io") ? 200 : 404 }); });
    const env = { DB: db } as unknown as Env;
    await runProbes(env, new Date(1_000_000_000));
    expect(hits.sort()).toEqual(["https://a.pages.dev", "https://dead.pages.dev"]);
    await runProbes(env, new Date(1_000_900_000));
    expect(raw.prepare("SELECT repo, url, url_source, probe_ok FROM projects ORDER BY repo").all().map((r: object) => ({ ...r }))).toEqual([
      { repo: "o/a", url: "https://o.github.io/a/", url_source: "pages", probe_ok: 1 },
      { repo: "o/b", url: null, url_source: null, probe_ok: 0 },
      { repo: "o/w", url: "https://w.dev", url_source: "website", probe_ok: null },
    ]);
    hits.length = 0;
    await runProbes(env, new Date(1_001_800_000)); // nothing due: a verified, b waits a week
    expect(hits).toEqual([]);
  });
});

describe("cleanUrl host safety (review)", () => {
  it("rejects IP literals, localhost and internal suffixes", async () => {
    const { cleanUrl } = await import("../../src/worker/lib/site");
    for (const u of ["https://10.0.0.1/", "https://169.254.169.254/x", "https://[::1]/", "https://localhost./", "https://a.localhost/", "https://db.internal/", "https://nas.local/", "https://x.home.arpa/"]) expect(cleanUrl(u), u).toBeNull();
    expect(cleanUrl("https://vincentwesley.github.io/koi-pond/")).toBe("https://vincentwesley.github.io/koi-pond/");
  });
});
