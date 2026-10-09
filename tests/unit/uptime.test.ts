import { afterEach, describe, expect, it, vi } from "vitest";
import minor from "../fixtures/statuspage/minor.json";
import none from "../fixtures/statuspage/none.json";
import invalid from "../fixtures/statuspage/invalid.json";
import { parseStatuspage } from "../../src/worker/lib/statuspage";
import { checkStatuspage, runUptime } from "../../src/worker/uptime";
import { route } from "../../src/worker/routes/projects";
import type { Env } from "../../src/worker/env";

// Fake D1: route by table name; record writes (single and batched).
function fakeDb(tables: Record<string, unknown[]>) {
  const writes: { sql: string; args: unknown[] }[] = [];
  const rowsFor = (sql: string, args: unknown[]) => {
    const t = /FROM (\w+)/.exec(sql.replace(/\(SELECT[^)]*\)/g, ""))?.[1] ?? "";
    const key = /COUNT\(\*\)/.test(sql) ? "agg" : /FROM checks/.test(sql) ? "recent" : /FROM lighthouse l/.test(sql) ? "lighthouse" : t;
    const rows = (tables[key] ?? []) as { project?: string }[];
    return key === "agg" || key === "recent" ? rows.filter((r) => r.project === args[0]) : rows;
  };
  const DB = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const st = {
        sql,
        get args() { return args; },
        bind: (...a: unknown[]) => ((args = a), st),
        run: async () => (writes.push({ sql, args }), {}),
        all: async () => ({ results: rowsFor(sql, args) }),
      };
      return st;
    },
    batch: async (ss: { sql: string; args: unknown[] }[]) =>
      ss.map((s) => (/^(INSERT|UPDATE|DELETE)/.test(s.sql) ? (writes.push({ sql: s.sql, args: s.args }), {}) : { results: rowsFor(s.sql, s.args) })),
  };
  return { env: { DB } as unknown as Env, writes };
}

afterEach(() => vi.unstubAllGlobals());
const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("statuspage parsing", () => {
  it("parses", () => {
    expect(parseStatuspage(minor)).toEqual({ name: "GitHub", indicator: "minor", description: "Minor Service Outage" });
    expect(parseStatuspage(none)?.indicator).toBe("none");
  });
  it("rejects garbage", () => {
    expect(parseStatuspage(invalid)).toBeNull();
    expect(parseStatuspage(null)).toBeNull();
  });
});

describe("runUptime", () => {
  const projects = [
    { repo: "a/ok", url: "https://ok.test", deps: '["https://www.githubstatus.com","https://nope.test"]' },
    { repo: "a/redir", url: "https://redir.test", deps: null },
    { repo: "a/500", url: "https://err.test", deps: "[]" },
    { repo: "a/slow", url: "https://slow.test", deps: "[]" },
  ];
  it("classifies checks, timeouts and statuspages", async () => {
    vi.stubGlobal("fetch", async (u: string) => {
      if (u === "https://www.githubstatus.com/api/v2/status.json") return resp(minor);
      if (u.startsWith("https://nope.test")) return resp("<html>", 404);
      if (u.startsWith("https://slow.test")) throw new DOMException("timeout", "TimeoutError");
      if (u.startsWith("https://err.test")) return resp("x", 500);
      if (u.startsWith("https://redir.test")) return resp("x", 302);
      return resp("x", 200);
    });
    const { env, writes } = fakeDb({ projects });
    await runUptime(env, true);
    const checks = Object.fromEntries(writes.filter((w) => /INTO checks/.test(w.sql)).map((w) => [w.args[0], w.args]));
    expect(checks["a/ok"][2]).toBe(1);
    expect(checks["a/redir"][2]).toBe(1);
    expect(checks["a/500"][2]).toBe(0);
    expect(checks["a/500"][3]).toBe(500);
    expect(checks["a/slow"][2]).toBe(0);
    expect(checks["a/slow"][3]).toBeNull();
    const api = Object.fromEntries(writes.filter((w) => /INTO api_status/.test(w.sql)).map((w) => [w.args[0], w.args]));
    expect(api["https://www.githubstatus.com"].slice(1, 3)).toEqual(["GitHub", "minor"]);
    expect(api["https://nope.test"][2]).toBe("unknown");
  });
});

describe("statuspage size cap", () => {
  it("treats oversized body or Content-Length as unknown", async () => {
    const big = new Response(JSON.stringify({ ...minor, pad: "x".repeat(300_000) }));
    const hdr = new Response(JSON.stringify(minor), { headers: { "Content-Length": "999999" } });
    for (const r of [big, hdr]) {
      vi.stubGlobal("fetch", async () => r);
      const { env, writes } = fakeDb({});
      await checkStatuspage(env, "https://big.test");
      expect(writes[0].args[2]).toBe("unknown");
    }
  });
});

describe("runUptime scheduling", () => {
  it("skips statuspages unless hourly; dedupes by origin", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => (urls.push(u), resp(minor)));
    const projects = [{ repo: "a/x", url: "https://x.test", deps: '["https://www.githubstatus.com/a","https://www.githubstatus.com/b"]' }];
    const { env, writes } = fakeDb({ projects });
    await runUptime(env);
    expect(urls).toEqual(["https://x.test"]);
    await runUptime(env, true);
    expect(urls.filter((u) => u.endsWith("/api/v2/status.json"))).toHaveLength(1);
    expect(writes.filter((w) => /INTO api_status/.test(w.sql)).map((w) => w.args[0])).toEqual(["https://www.githubstatus.com/a", "https://www.githubstatus.com/b"]);
  });
  it("logs a failing task instead of swallowing it", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => resp(minor));
    const { env } = fakeDb({ projects: [{ repo: "a/x", url: "https://x.test", deps: '["https://d.test"]' }] });
    const batch = env.DB.batch.bind(env.DB);
    (env.DB as any).batch = async (ss: { sql: string }[]) => { if (/api_status/.test(ss[0].sql)) throw new Error("boom"); return batch(ss as never); };
    await runUptime(env, true);
    expect(err).toHaveBeenCalled();
  });
});

describe("GET /api/projects", () => {
  const get = (env: Env) => route(new Request("http://x/api/projects"), env, "/api/projects");
  it("ignores other paths", async () => {
    expect(await route(new Request("http://x/api/z"), {} as Env, "/api/z")).toBeNull();
  });
  it("aggregates", async () => {
    const { env } = fakeDb({
      projects: [
        { repo: "a/one", name: "One", url: "https://one.test", deps: '["https://d.test"]' },
        { repo: "a/two", name: "Two", url: "https://two.test", deps: null },
      ],
      agg: [{ project: "a/one", n: 3, up: 2 }],
      // newest first, as the per-project ORDER BY ts DESC query returns them
      recent: [
        { project: "a/one", ok: 1, ms: 150 },
        { project: "a/one", ok: 0, ms: 200 },
        { project: "a/one", ok: 1, ms: 100 },
      ],
      ci: [{ repo: "a/one", status: "completed", conclusion: "success", url: "u" }],
      lighthouse: [{ project: "a/one", week: "2026-W40", performance: 90, accessibility: 100, best_practices: 95, seo: 99 }],
      api_status: [{ url: "https://d.test", name: "D", indicator: "none" }],
    });
    const r = await get(env);
    expect(r!.headers.get("Cache-Control")).toBe("public, max-age=60");
    const [one, two] = (await r!.json()) as any[];
    expect(one).toMatchObject({ up: true, uptime30d: 66.7, latencyMs: [100, 200, 150], ci: { conclusion: "success" } });
    expect(one.lighthouse.week).toBe("2026-W40");
    expect(one.deps).toEqual([{ url: "https://d.test", name: "D", indicator: "none" }]);
    expect(two).toMatchObject({ up: null, uptime30d: null, latencyMs: [], ci: null, lighthouse: null, deps: [] });
  });
});
