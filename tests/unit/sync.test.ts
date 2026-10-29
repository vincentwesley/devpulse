import { afterEach, describe, expect, it, vi } from "vitest";
import page from "../fixtures/github/repos-graphql.json";
import { handleApi } from "../../src/worker/api";
import { runScheduled } from "../../src/worker/cron";
import { syncGithub } from "../../src/worker/github";
import { runShots, type Launch } from "../../src/worker/shots";
import type { Env } from "../../src/worker/env";
import { sqliteDb } from "./_sqlite";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

const fx = (page.data.viewer.repositories.nodes as any[]).map((n, i) => ({ ...n, id: `ID${i}`, updatedAt: n.pushedAt }));
const T = new Date("2026-10-09T05:15:00Z");
const SECRETS = ["secret-project-xyz", "secret commit message", "secret-site", "secret-dep", "secret-topic", "top secret description", "secret-v1"];

/** Real SQLite + the fixture world (1 private repo full of secrets) synced through the list and detail passes. */
async function world() {
  vi.useFakeTimers({ now: +T + 60_000, toFake: ["Date"] });
  const s = sqliteDb();
  vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
    const { query, variables } = JSON.parse(init.body as string);
    if (query.includes("contributionCalendar")) return Response.json({ data: { user: { contributionsCollection: { contributionCalendar: { weeks: [] } } } } });
    if (query.includes("nodes(ids")) return Response.json({ data: { nodes: variables.ids.map((id: string) => fx.find((n) => n.id === id) ?? null) } });
    return Response.json({ data: { viewer: { repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: fx } } } });
  });
  const logs: string[] = [];
  for (const k of ["log", "warn", "error", "info"] as const) vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(" ")); });
  const env = { DB: s.db, GITHUB_TOKEN: "t", GITHUB_OWNER: "o", ASSETS: { fetch: async () => new Response("<html><head><title>x</title></head></html>") } } as unknown as Env;
  await syncGithub(env, T);
  const get = (p: string, init?: RequestInit) => handleApi(new Request("http://x" + p, init), env);
  return { ...s, env, get, logs };
}

describe("sheet sync", () => {
  it("/sync.md: header, one pipe line per public repo (archived included), stage key; text/plain, cached 5 min", async () => {
    const { get } = await world();
    const r = await get("/sync.md");
    expect(r.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=300");
    const lines = (await r.text()).split("\n");
    expect(lines.slice(0, 5)).toEqual([
      "# DevPulse sheet sync",
      "generated: 2026-10-09T05:16:00Z",
      "source: http://x/sync.json (same data: http://x/sync.csv; README snippets: http://x/sync/snippets.md)",
      "public repos: 3 · live: 2 · stale: 2",
      "columns: sheetId | repo | url | stage | lastPush | ci | uptime30d | release | created | checked | stale | gaps",
    ]);
    expect(lines.slice(6, 9)).toEqual([
      "- | bare | - | active | 2026-10-03 | none | - | - | - | 2026-10-09T05:15Z | no | readme,screenshot,about,website,topics",
      "- | metalens | https://metalens.example.dev | live-pending | 2026-10-08 | success | - | v1.4.0 | 2026-01-02 | 2026-10-09T05:15Z | yes (uptime) | readme,screenshot",
      "- | old | https://o.example | archived | 2026-10-01 | none | - | - | - | 2026-10-09T05:15Z | yes (uptime) | readme,screenshot,about,topics",
    ]);
    expect(lines.some((l) => l.startsWith("stages: archived > live-down"))).toBe(true);
  });

  it("/sync.json and /sync.csv carry the same rows; csv quotes per RFC 4180 with generatedAt last", async () => {
    const { get } = await world();
    const j = await (await get("/sync.json")).json() as any;
    expect(j.columns).toEqual(["sheetId", "repo", "url", "stage", "lastPush", "ci", "uptime30d", "release", "created", "checked", "stale", "gaps"]);
    expect(j.repos.map((r: any) => r.repo)).toEqual(["bare", "metalens", "old"]);
    expect(j.repos[1]).toMatchObject({ url: "https://metalens.example.dev", ci: "success", release: "v1.4.0", card: "http://x/card/metalens.svg", shot: "http://x/shot/metalens.jpg", page: "http://x/p/metalens", gaps: ["readme", "screenshot"] });
    expect(j.repos[1].snippet).toContain("<!-- devpulse:start -->");
    const csv = await (await get("/sync.csv")).text();
    const rows = csv.trimEnd().split("\r\n");
    expect(rows[0]).toBe("sheetId,repo,url,stage,lastPush,ci,uptime30d,release,created,checked,stale,gaps,generatedAt");
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain('"readme,screenshot,about,website,topics"');
    expect((await get("/sync/snippets.md")).headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect((await get("/sync.md", { method: "HEAD" })).status).toBe(200);
  });

  it("no private repo name or detail reaches any public output, D1 bind or log", async () => {
    const { get, raw, logs, env } = await world();
    const outs = await Promise.all(["/sync.md", "/sync.json", "/sync.csv", "/sync/snippets.md", "/grid.svg", "/api/projects", "/api/stats", "/api/health"].map(async (p) => (await get(p)).text()));
    await runScheduled({ scheduledTime: +T + 900_000 } as ScheduledController, env);
    const dump = JSON.stringify(raw.prepare("SELECT * FROM projects").all()) + JSON.stringify(raw.prepare("SELECT * FROM meta").all()) + outs.join("\n") + logs.join("\n");
    for (const s of SECRETS) expect(dump).not.toContain(s);
    expect(dump).toContain("metalens");
  });
});

describe("/api/projects hub fields", () => {
  it("stage, freshness, audit, snippet, showcase and fallback cover", async () => {
    const { get, raw } = await world();
    raw.prepare("UPDATE projects SET readme_image='docs/a.png', showcase_json=? WHERE name='bare'").run(JSON.stringify({ summary: "S", highlights: ["h"], runThrough: { steps: ["s"], commands: ["npm i"] }, images: [{ path: "docs/a.png", alt: "A" }] }));
    const ps = await (await get("/api/projects")).json() as any[];
    const bare = ps.find((p) => p.name === "bare"), ml = ps.find((p) => p.name === "metalens");
    expect(bare).toMatchObject({ stage: "active", archived: false, urlSource: null, sheetId: null, shot: null, cover: expect.stringMatching(/^\/img\/bare\?v=[0-9a-f]{8}$/), checkedAt: T.toISOString(), detailAt: "2026-10-09T05:15:00Z" });
    expect(bare.showcase).toEqual({ summary: "S", highlights: ["h"], runThrough: { steps: ["s"], commands: ["npm i"] }, images: [{ url: expect.stringMatching(/^\/img\/bare\/0\?v=[0-9a-f]{8}$/), alt: "A" }] });
    expect(ml).toMatchObject({ stage: "live-pending", urlSource: "website", stale: true, staleWhy: ["uptime"], audit: ["readme", "screenshot"], uptimeAt: null, shotAt: null });
    expect(ml.snippet).toContain("(http://x/shot/metalens.jpg)](https://metalens.example.dev)");
    expect(ps.find((p) => p.name === "old").stage).toBe("archived");
  });
});

describe("/shot and /img/<name>/<i>", () => {
  it("serves the stored shot (6 h, ETag, cross-origin, 304), else 302 to the committed image, else 404 no-store", async () => {
    const { get, raw } = await world();
    raw.prepare("INSERT INTO shots (repo,name,bytes,type,taken_at,tried_at) VALUES ('o/metalens','metalens',?,'image/jpeg',1700000000,1700000000)").run(new Uint8Array([1, 2, 3]));
    const r = await get("/shot/metalens.jpg");
    expect([r.status, r.headers.get("Content-Type"), r.headers.get("Cache-Control"), r.headers.get("ETag"), r.headers.get("Cross-Origin-Resource-Policy")]).toEqual([200, "image/jpeg", "public, max-age=21600", '"1700000000"', "cross-origin"]);
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([1, 2, 3]);
    expect((await get("/shot/metalens.jpg", { headers: { "If-None-Match": '"1700000000"' } })).status).toBe(304);
    expect((await get("/shot/METALENS.jpg")).headers.get("Location")).toBe("/shot/metalens.jpg");
    raw.prepare("UPDATE projects SET readme_image='docs/a.png' WHERE name='bare'").run();
    const fb = await get("/shot/bare.jpg");
    expect([fb.status, fb.headers.get("Location"), fb.headers.get("Cache-Control")]).toEqual([302, "/img/bare", "public, max-age=3600"]);
    const none = await get("/shot/old.jpg");
    expect([none.status, none.headers.get("Cache-Control")]).toEqual([404, "no-store"]);
    expect((await get("/shot/secret-project-xyz.jpg")).status).toBe(404);
    expect((await get("/shot/..%2f.jpg")).status).toBe(404);
  });

  it("/img/<name>/<i> fetches showcase image i from the repo; out-of-range or unsafe -> 404; /img/<name> falls back to readme_image", async () => {
    const { get, raw } = await world();
    raw.prepare("UPDATE projects SET readme_image='docs/r.png', showcase_json=? WHERE name='bare'").run(JSON.stringify({ images: [{ path: "docs/a.png", alt: "A" }, { path: "docs/b.webp", alt: "B" }] }));
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => { asked.push(u); return new Response(new Uint8Array([9]), { headers: { "Content-Type": u.endsWith(".webp") ? "image/webp" : "image/png" } }); });
    const one = await get("/img/bare/1");
    expect([one.status, one.headers.get("Content-Type"), one.headers.get("Cache-Control")]).toEqual([200, "image/webp", "public, max-age=86400"]);
    expect((await get("/img/bare")).status).toBe(200);
    expect(asked).toEqual(["https://raw.githubusercontent.com/o/bare/HEAD/docs/b.webp", "https://raw.githubusercontent.com/o/bare/HEAD/docs/r.png"]);
    for (const p of ["/img/bare/2", "/img/bare/6", "/img/bare/x", "/img/bare/0/1", "/img/old/0"]) expect((await get(p)).status, p).toBe(404);
    expect((await get("/img/BARE/1?v=1")).headers.get("Location")).toBe("/img/bare/1?v=1");
  });

  it("/grid.svg lists non-archived public repos with stage labels", async () => {
    const { get } = await world();
    const r = await get("/grid.svg");
    const t = await r.text();
    expect(r.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
    expect(t).toContain(">metalens<");
    expect(t).toContain(">live-pending<");
    expect(t).not.toContain(">old<");
    expect(t).toMatch(/aria-label="DevPulse: 2 projects/);
  });
});

describe("snapshots", () => {
  const browser = (sizes: number[], log: string[]): Launch => async () => {
    log.push("launch");
    let i = 0;
    return {
      newPage: async () => ({ setViewport: async () => {}, goto: async (u: string) => { log.push(u); if (sizes[i] < 0) throw new Error("timeout"); }, screenshot: async () => new Uint8Array(Math.max(0, sizes[i++])), close: async () => {} }),
      close: async () => { log.push("close"); },
    };
  };
  it("never-shot -> shot; unchanged -> never again; pushed but < 24 h -> wait; failure or blank keeps the old image", async () => {
    const { env, raw } = await world();
    const e = { ...env, BROWSER: {} } as unknown as Env;
    raw.prepare("UPDATE projects SET url=NULL WHERE name='old'").run();
    const log: string[] = [];
    await runShots(e, T, browser([20_000], log));
    expect(log).toEqual(["launch", "https://metalens.example.dev", "close"]);
    const shot = () => ({ ...raw.prepare("SELECT length(bytes) AS n, taken_at, tried_at FROM shots").get() });
    expect(shot()).toEqual({ n: 20_000, taken_at: +T / 1000, tried_at: +T / 1000 });
    expect(Number(raw.prepare("SELECT value FROM meta WHERE key='shot_ms:2026-10-09'").get().value)).toBeGreaterThanOrEqual(0);
    log.length = 0;
    await runShots(e, new Date(+T + 3 * 86400_000), browser([20_000], log)); // no push since: keep forever
    expect(log).toEqual([]);
    raw.prepare("UPDATE projects SET pushed_at='2026-10-09T06:00:00Z' WHERE name='metalens'").run();
    await runShots(e, new Date(+T + 3600_000), browser([20_000], log)); // changed, but last shot < 24 h
    expect(log).toEqual([]);
    await runShots(e, new Date(+T + 86400_000), browser([100], log)); // changed, 24 h later, near-blank capture
    expect(log).toHaveLength(3);
    expect(shot()).toEqual({ n: 20_000, taken_at: +T / 1000, tried_at: +T / 1000 + 86400 }); // old image kept, retry tomorrow
    log.length = 0;
    await runShots(e, new Date(+T + 86400_000 + 900_000), browser([20_000], log));
    expect(log).toEqual([]);
    await runShots(e, new Date(+T + 2 * 86400_000), browser([30_000], log));
    expect(shot()).toMatchObject({ n: 30_000, taken_at: +T / 1000 + 2 * 86400 });
  });
  it("respects the daily browser budget and needs the binding", async () => {
    const { env, raw } = await world();
    const log: string[] = [];
    await runShots(env, T, browser([20_000], log));
    expect(log).toEqual([]); // no BROWSER binding
    raw.prepare("INSERT INTO meta (key,value) VALUES ('shot_ms:2026-10-09','360000')").run();
    await runShots({ ...env, BROWSER: {} } as unknown as Env, T, browser([20_000], log));
    expect(log).toEqual([]);
  });
});
