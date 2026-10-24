import { describe, expect, it } from "vitest";
import { route } from "../../src/worker/routes/projects";
import type { Env } from "../../src/worker/env";
import { fakeDb } from "./_db";

describe("/api/projects", () => {
  const projects = Array.from({ length: 50 }, (_, i) => ({ repo: `o/r${i}`, name: `r${i}`, url: i % 2 ? `https://r${i}.test` : null, deps: "[]", topics: "[]" }));
  const get = (db: D1Database) => route(new Request("http://x/api/projects"), { DB: db } as Env, "/api/projects") as Promise<Response>;

  it("uses a constant, small number of D1 statements with 50 projects (free tier cap 50)", async () => {
    const { db, log, ops } = fakeDb({ "FROM projects": projects });
    const r = await get(db);
    expect(r.status).toBe(200);
    expect(ops.n).toBeLessThanOrEqual(10);
    expect(log.length).toBeLessThanOrEqual(10);
  });

  it("never scans checks and reads uptime_summary", async () => {
    const { db, log } = fakeDb({ "FROM projects": projects });
    await get(db);
    expect(log.some((q) => /FROM checks/.test(q.sql))).toBe(false);
    expect(log.some((q) => /FROM uptime_summary/.test(q.sql))).toBe(true);
  });

  it("keeps the response shape: uptime, latency oldest-first, up from summary, no-site = null/empty", async () => {
    const { db } = fakeDb({
      "FROM projects": projects.slice(0, 2),
      "FROM uptime_summary": [{ project: "o/r1", up: 0, uptime30d: 75, latency_json: "[100,200]" }],
    });
    const r = await get(db);
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=300");
    const body = (await r.json()) as { repo: string; up: boolean | null; uptime30d: number | null; latencyMs: number[] }[];
    expect(body[0]).toMatchObject({ repo: "o/r0", up: null, uptime30d: null, latencyMs: [] });
    expect(body[1]).toMatchObject({ repo: "o/r1", up: false, uptime30d: 75, latencyMs: [100, 200] });
  });
});
