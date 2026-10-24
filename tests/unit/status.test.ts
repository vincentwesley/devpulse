// @ts-ignore no @types/node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "../../src/worker/api";
import { pruneChecks } from "../../src/worker/prune";
import { readBounded } from "../../src/worker/lib/http";
import { parseFeed } from "../../src/worker/lib/rss";
import { renderCard } from "../../src/worker/routes/card";
import { checkProject, recordChecks, type Check } from "../../src/worker/uptime";
import type { Env } from "../../src/worker/env";
import { fakeDb } from "./_db";
import { sqliteDb } from "./_sqlite";

afterEach(() => vi.useRealTimers());

const chk = (project: string, ok: number, status: number | null = ok ? 200 : 500, ts = Math.floor(Date.now() / 1000)): Check => ({ project, ts, ok, status, ms: 40 });
const seed = (raw: any) => raw.exec(`INSERT INTO projects (repo,name,url,updated_at,ci_state,description,stars,release_tag,release_at) VALUES ('o/a','a','https://a.test','2026-10-05T10:00:00.000Z','SUCCESS','Desc <b>',3,'v1','2026-10-02T00:00:00Z')`);
const call = (path: string, env: Env, init?: RequestInit) => handleApi(new Request("http://x" + path, init), env);

describe("recordChecks (real SQL)", () => {
  it("constant statement count regardless of site count", async () => {
    const { db, stmts } = sqliteDb();
    await recordChecks({ DB: db } as Env, Array.from({ length: 30 }, (_, i) => chk(`o/r${i}`, 1)));
    expect(stmts.n).toBeLessThanOrEqual(7);
  });
  it("daily rollup increments today's row; summary tracks latest + 30d %", async () => {
    const { db, raw } = sqliteDb();
    const env = { DB: db } as Env;
    await recordChecks(env, [chk("o/a", 1)]);
    await recordChecks(env, [chk("o/a", 0)]);
    await recordChecks(env, [chk("o/a", 1)]);
    await recordChecks(env, [chk("o/a", 1)]);
    expect(raw.prepare("SELECT up, total FROM daily_uptime").all()).toEqual([{ up: 3, total: 4 }]);
    const s = raw.prepare("SELECT up, uptime30d, latency_json FROM uptime_summary").get();
    expect({ ...s }).toEqual({ up: 1, uptime30d: 75, latency_json: "[40,40,40,40]" });
    expect(raw.prepare("SELECT COUNT(*) AS n FROM checks").get().n).toBe(4);
  });
  it("opens an incident on first failure, keeps one while down, closes on recovery", async () => {
    const { db, raw } = sqliteDb();
    const env = { DB: db } as Env;
    await recordChecks(env, [chk("o/a", 1)]);
    expect(raw.prepare("SELECT * FROM incidents").all()).toEqual([]);
    await recordChecks(env, [chk("o/a", 0, 503)]);
    await recordChecks(env, [chk("o/a", 0, 500)]);
    let inc = raw.prepare("SELECT project, status, end_ts FROM incidents").all().map((r: object) => ({ ...r }));
    expect(inc).toEqual([{ project: "o/a", status: 503, end_ts: null }]);
    await recordChecks(env, [chk("o/a", 1)]);
    inc = raw.prepare("SELECT end_ts FROM incidents").all();
    expect(inc).toHaveLength(1);
    expect(inc[0].end_ts).toBeGreaterThan(0);
    await recordChecks(env, [chk("o/a", 0, null)]); // a new outage = a new incident
    expect(raw.prepare("SELECT COUNT(*) AS n FROM incidents").get().n).toBe(2);
  });
  it("prune drops rollups older than 90 days", async () => {
    const { db, raw } = sqliteDb();
    seed(raw);
    raw.exec("INSERT INTO daily_uptime VALUES ('o/a','2020-01-01',1,1), ('o/a','2999-01-01',1,1)");
    raw.exec("INSERT INTO incidents (project,start_ts,end_ts) VALUES ('o/a',1,2), ('o/a',3,NULL)");
    await pruneChecks({ DB: db } as Env);
    expect(raw.prepare("SELECT date FROM daily_uptime").all().map((r: any) => r.date)).toEqual(["2999-01-01"]);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM incidents").get().n).toBe(1);
  });
  it("prune closes open incidents of unmonitored or stale projects", async () => {
    const { db, raw } = sqliteDb();
    const t = Math.floor(Date.now() / 1000);
    raw.exec(`INSERT INTO uptime_summary VALUES ('o/live',1,100,'[]',${t}), ('o/stale',1,100,'[]',${t - 3 * 86400})`);
    raw.exec("INSERT INTO incidents (project,start_ts) VALUES ('o/live',1), ('o/stale',1), ('o/gone',1)");
    await pruneChecks({ DB: db } as Env);
    const open = raw.prepare("SELECT project FROM incidents WHERE end_ts IS NULL").all().map((r: any) => r.project);
    expect(open).toEqual(["o/live", "o/stale"]);
  });
  it("0004 backfill builds rollups, summary and incidents from checks; idempotent", async () => {
    const { raw } = sqliteDb();
    const t = Math.floor(Date.now() / 1000);
    // oldest-first: ok, fail, fail, ok, ok (+ one null-ms row)
    const rows = [[1, 1, 200, 10], [2, 0, 500, 20], [3, 0, 500, 30], [4, 1, 200, 40], [5, 1, 200, null]];
    for (const [i, ok, s, ms] of rows) raw.prepare("INSERT INTO checks VALUES ('o/a',?,?,?,?)").run(t - 600 + (i as number) * 60, ok, s, ms);
    raw.prepare("INSERT INTO checks VALUES ('o/b',?,0,NULL,5)").run(t - 100);
    const sql = readFileSync(new URL("../../migrations/0004_backfill.sql", import.meta.url), "utf8");
    raw.exec(sql);
    raw.exec(sql);
    expect(raw.prepare("SELECT SUM(up) AS up, SUM(total) AS total FROM daily_uptime WHERE project='o/a'").get()).toMatchObject({ up: 3, total: 5 });
    const s = raw.prepare("SELECT * FROM uptime_summary WHERE project='o/a'").get() as any;
    expect(s).toMatchObject({ up: 1, uptime30d: 60, updated_at: t - 600 + 300 });
    expect(JSON.parse(s.latency_json)).toEqual([10, 20, 30, 40]);
    expect(raw.prepare("SELECT up FROM uptime_summary WHERE project='o/b'").get()).toMatchObject({ up: 0 });
    const inc = raw.prepare("SELECT project, start_ts, end_ts FROM incidents ORDER BY project").all() as any[];
    expect(inc).toHaveLength(2);
    expect(inc[0]).toMatchObject({ project: "o/a", start_ts: t - 600 + 120, end_ts: t - 600 + 240 });
    expect(inc[1]).toMatchObject({ project: "o/b", end_ts: null });
  });
  it("checkProject returns a plain row", async () => {
    vi.stubGlobal("fetch", async () => new Response("x", { status: 500 }));
    expect(await checkProject("o/a", "https://a.test")).toMatchObject({ project: "o/a", ok: 0, status: 500 });
    vi.unstubAllGlobals();
  });
});

describe("GET /api/status", () => {
  it("shape: sites with day bars, 90d %, incidents", async () => {
    const { db, raw } = sqliteDb();
    seed(raw);
    const env = { DB: db } as Env;
    await recordChecks(env, [chk("o/a", 1)]);
    await recordChecks(env, [chk("o/a", 0, 502)]);
    const r = await call("/api/status", env);
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=300");
    const b = (await r.json()) as any;
    expect(b.sites).toHaveLength(1);
    expect(b.sites[0]).toMatchObject({ name: "a", repo: "o/a", url: "https://a.test", up: false, uptime90d: 50 });
    expect(b.sites[0].days).toEqual([{ date: new Date().toISOString().slice(0, 10), up: 1, total: 2 }]);
    expect(b.incidents).toHaveLength(1);
    expect(b.incidents[0]).toMatchObject({ name: "a", end: null, status: 502 });
    expect(new Date(b.incidents[0].start).toISOString()).toBe(b.incidents[0].start);
  });
  it("one batch, no checks scan", async () => {
    const f = fakeDb({});
    await call("/api/status", { DB: f.db } as Env);
    expect(f.ops.n).toBe(1);
    expect(f.log.some((q) => /FROM checks/.test(q.sql))).toBe(false);
  });
});

describe("rate limiting", () => {
  const rl = (ok: boolean) => ({ limit: vi.fn(async () => ({ success: ok })) });
  it("429 no-store + Retry-After when limited, keyed by cf-connecting-ip", async () => {
    const RL = rl(false);
    const r = await call("/api/health", { RL } as unknown as Env, { headers: { "cf-connecting-ip": "1.2.3.4" } });
    expect(r.status).toBe(429);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.headers.get("Retry-After")).toBe("10");
    expect(RL.limit).toHaveBeenCalledWith({ key: "1.2.3.4" });
  });
  it("applies to badge, card and feed too; passes when allowed; absent binding => no limit", async () => {
    for (const p of ["/badge/a.svg", "/card/a.svg", "/feed.xml"]) expect((await call(p, { RL: rl(false) } as unknown as Env)).status).toBe(429);
    expect((await call("/api/health", { RL: rl(true), DB: sqliteDb().db } as unknown as Env)).status).toBe(200);
    expect((await call("/api/health", { DB: sqliteDb().db } as Env)).status).toBe(200);
  });
  it("limiter outage fails open", async () => {
    const RL = { limit: async () => { throw new Error("down"); } };
    expect((await call("/api/health", { RL, DB: sqliteDb().db } as unknown as Env)).status).toBe(200);
  });
});

describe("headers", () => {
  it("json, svg and xml all carry HSTS, no-referrer, nosniff, frame-ancestors; json defaults no-store", async () => {
    const { db, raw } = sqliteDb();
    seed(raw);
    const env = { DB: db } as Env;
    const health = await call("/api/health", env);
    expect(health.headers.get("Cache-Control")).toBe("no-store");
    for (const r of [health, await call("/badge/a.svg", env), await call("/card/a.svg", env), await call("/feed.xml", env), await call("/api/nope", env)]) {
      expect(r.headers.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
      expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(r.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    }
  });
  it("one cache lookup per request", async () => {
    const match = vi.fn(async () => undefined);
    vi.stubGlobal("caches", { default: { match, put: async () => {} } });
    await call("/api/health", {} as Env);
    await call("/badge/zz.svg", { DB: fakeDb({}).db } as Env);
    expect(match).toHaveBeenCalledTimes(1); // health is uncached
    vi.unstubAllGlobals();
  });
});

describe("GET /card/:name.svg", () => {
  it("renders a 495x120 card with escaped text and validated colours", async () => {
    const f = fakeDb({
      "SELECT name FROM projects": [{ name: "a" }],
      "SELECT name, description": [{ name: "a", description: "<script>x</script>", stars: 3, ci_state: "SUCCESS", url: "https://a.test" }],
      "FROM languages": [{ lang: "TS", bytes: 3, color: "#3178c6" }, { lang: "Evil", bytes: 1, color: 'red" onload="x' }],
      "FROM uptime_summary": [{ up: 1, uptime30d: 99.5 }],
    });
    const r = await call("/card/a.svg", { DB: f.db } as Env);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=300");
    const t = await r.text();
    expect(t).toContain('width="495" height="120"');
    expect(t).toContain("CI passing · up 99.5%");
    expect(t).not.toContain("<script");
    expect(t).not.toContain("onload");
    expect(t).toContain("#3178c6");
    expect(f.ops.n).toBe(2); // name lookup + one batch
  });
  it("renderCard strips control chars", () => expect(renderCard({ name: "n\x00\x1Fx", description: "d\x0B", stars: 1, ci_state: null, url: null }, [], null, null)).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/));
  it("renderCard copes with no languages", () => expect(renderCard({ name: "n", description: null, stars: null, ci_state: null, url: null }, [], null, null)).toContain("no CI"));
  it("rejects bad names without a DB lookup, unknown -> 404 svg never cached", async () => {
    for (const bad of ["a%20b", "..%2Fx", "x".repeat(101), "a%3Cb"]) {
      const f = fakeDb({});
      const r = await call(`/card/${bad}.svg`, { DB: f.db } as Env);
      expect(r.status, bad).toBe(404);
      expect(f.ops.n, bad).toBe(0);
    }
    const r = await call("/card/nope.svg", { DB: fakeDb({}).db } as Env);
    expect(r.status).toBe(404);
    expect(r.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("GET /feed.xml", () => {
  it("valid Atom: escaped, https only, <=50 entries, sorted", async () => {
    const commits = Array.from({ length: 60 }, (_, i) => ({ repo: "o/a", sha: `s${i}`, message: `m<${i}>&\x00\x1Fbody\nx`, ts: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), url: `https://github.com/o/a/commit/s${i}` }));
    commits.push({ repo: "o/a", sha: "bad", message: "js", ts: "2026-10-09T00:00:00Z", url: "javascript:alert(1)" }, { repo: "o/a", sha: "baddate", message: "d", ts: "nope", url: "https://x.test/" });
    const f = fakeDb({
      "FROM commits_recent": commits,
      "FROM projects": [{ repo: "o/a", name: "A&B", release_tag: "v1 2", release_at: "2026-10-05T00:00:00Z" }],
      "FROM posts": [{ title: "Post", url: "http://insecure.test/p", published: "2026-10-06T00:00:00Z" }],
    });
    const r = await call("/feed.xml", { DB: f.db } as Env);
    expect(r.headers.get("Content-Type")).toBe("application/atom+xml; charset=utf-8");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(f.ops.n).toBe(1);
    const t = await r.text();
    expect(t.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(t.match(/<entry>/g)).toHaveLength(50);
    expect(t.match(/<entry>/g)!.length).toBe(t.match(/<\/entry>/g)!.length);
    expect(t).not.toContain("javascript:");
    expect(t).not.toContain("http://insecure");
    expect(t).not.toContain("m<0>");
    expect(t).not.toMatch(/[\x00-\x08\x0B\x0C\x0E-\x1F]/);
    expect(t).toContain("A&amp;B v1 2");
    expect(t).toContain("releases/tag/v1%202");
    expect(t).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/); // no bare ampersands
    expect(t.match(/<updated>([^<]+)<\/updated>/g)!.every((u) => !isNaN(Date.parse(u.replace(/<\/?updated>/g, ""))))).toBe(true);
    expect(t.indexOf("<id>tag:devpulse.vincentwesleybiz.workers.dev,2026-10-24:release:o/a:v1%202</id>")).toBeGreaterThan(-1);
    expect(t.endsWith("</feed>")).toBe(true);
  });
  it("empty feed still valid", async () => {
    const t = await (await call("/feed.xml", { DB: fakeDb({}).db } as Env)).text();
    expect(t).toContain("<feed");
    expect(t).not.toContain("<entry>");
  });
});

describe("robustness", () => {
  it("rss: adversarial unclosed items finish fast and are capped", () => {
    const t0 = performance.now();
    expect(parseFeed("<item><title>x<link>".repeat(100_000) + "</item>")).toEqual([]);
    expect(parseFeed("<item><link href='https://a.test/'".repeat(50_000) + "</item>")).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(200);
  });
  it("rss: caps at 50 items", () => {
    const xml = Array.from({ length: 80 }, (_, i) => `<item><title>t${i}</title><link>https://a.test/${i}</link></item>`).join("");
    expect(parseFeed(xml)).toHaveLength(50);
  });
  it("readBounded counts bytes, not chars, and stops early", async () => {
    expect(await readBounded(new Response("é".repeat(150)), 200)).toBeNull(); // 300 bytes, 150 chars
    expect(await readBounded(new Response("é".repeat(100)), 200)).toBe("é".repeat(100));
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(1000)); if (pulled > 1000) c.close(); } });
    expect(await readBounded(new Response(stream), 5000)).toBeNull();
    expect(pulled).toBeLessThan(20);
    expect(await readBounded(new Response(null), 10)).toBe("");
  });
});
