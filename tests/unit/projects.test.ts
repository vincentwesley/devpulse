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

  it("keeps the response shape: uptime, latency oldest-first, up from newest point, no-site = null/empty", async () => {
    const { db } = fakeDb({
      "FROM projects": projects.slice(0, 2),
      "GROUP BY project": [{ project: "o/r1", n: 4, up: 3 }],
      "row_number()": [{ project: "o/r1", ok: 1, ms: 100 }, { project: "o/r1", ok: 0, ms: null }],
    });
    const body = (await (await get(db)).json()) as { repo: string; up: boolean | null; uptime30d: number | null; latencyMs: number[] }[];
    expect(body[0]).toMatchObject({ repo: "o/r0", up: null, uptime30d: null, latencyMs: [] });
    expect(body[1]).toMatchObject({ repo: "o/r1", up: false, uptime30d: 75, latencyMs: [100] });
  });
});
