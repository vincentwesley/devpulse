import { describe, expect, it } from "vitest";
import { route } from "../../src/worker/routes/ingest";
import type { Env } from "../../src/worker/env";

const runs: unknown[][] = [];
const env = (token: string | undefined = "secret", known = true) =>
  ({
    INGEST_TOKEN: token,
    DB: {
      prepare: (sql: string) => ({
        bind: (...a: unknown[]) => ({
          first: async () => (known ? { 1: 1 } : null),
          run: async () => void runs.push([sql, ...a]),
        }),
      }),
    },
  }) as unknown as Env;
const scores = { performance: 90, accessibility: 100, best_practices: 95, seo: 80 };
const post = (body: unknown, auth: string | null = "Bearer secret", method = "POST") =>
  new Request("http://x/api/ingest/lighthouse", {
    method,
    headers: auth ? { Authorization: auth } : {},
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
const good = { project: "o/r", week: "2024-W05", scores };
const call = (req: Request, e = env()) => route(req, e, "/api/ingest/lighthouse");

describe("ingest route", () => {
  it("ignores other paths", async () => expect(await route(post(good), env(), "/api/x")).toBeNull());
  it("405 non-POST", async () => expect((await call(post(null, null, "GET")))!.status).toBe(405));
  it("503 when token unset", async () => expect((await call(post(good), env("")))!.status).toBe(503));
  it("401 missing / wrong / wrong scheme", async () => {
    for (const a of [null, "Bearer nope", "Bearer secret2", "secret", "Bearer "])
      expect((await call(post(good, a)))!.status).toBe(401);
  });
  it("400 on invalid bodies", async () => {
    const bad = [
      "{nope", { ...good, project: 5 }, { ...good, week: "2024-W54" }, { ...good, week: "2024-02-30" },
      { ...good, scores: { ...scores, seo: 101 } }, { ...good, scores: { ...scores, seo: 1.5 } },
      { ...good, scores: { ...scores, seo: "9" } }, { ...good, scores: { performance: 1 } }, { ...good, scores: undefined },
    ];
    for (const b of bad) expect((await call(post(b)))!.status).toBe(400);
  });
  it("413 on Content-Length before reading", async () => {
    const r = post(good);
    r.headers.set("Content-Length", "5000");
    expect((await call(r))!.status).toBe(413);
  });
  it("413 oversize", async () =>
    expect((await call(post({ ...good, pad: "x".repeat(3000) })))!.status).toBe(413));
  it("404 unknown project", async () => expect((await call(post(good), env("secret", false)))!.status).toBe(404));
  it("upserts, normalising a date to its week", async () => {
    runs.length = 0;
    const r = await call(post({ ...good, week: "2024-01-29" }));
    expect(r!.status).toBe(200);
    expect(runs[0].slice(1)).toEqual(["o/r", "2024-W05", 90, 100, 95, 80]);
  });
  it("date at year boundary maps to W53", async () => {
    runs.length = 0;
    await call(post({ ...good, week: "2020-12-28" }));
    expect(runs[0][2]).toBe("2020-W53");
  });
});
