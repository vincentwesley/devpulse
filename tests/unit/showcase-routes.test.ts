import { afterEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "../../src/worker/api";
import { readmeExcerpt } from "../../src/worker/lib/github-parse";
import { route as projects } from "../../src/worker/routes/projects";
import type { Env } from "../../src/worker/env";
import { fakeDb } from "./_db";

afterEach(() => vi.unstubAllGlobals());

describe("cover cache-busting", () => {
  const row = (cover_path: string | null, pushed_at: string | null) => ({ repo: "o/a", name: "a", url: null, deps: "[]", topics: "[]", cover_path, pushed_at });
  const cover = async (r: ReturnType<typeof row>) => {
    const res = (await projects(new Request("http://x/api/projects"), { DB: fakeDb({ "FROM projects": [r] }).db } as Env, "/api/projects"))!;
    return ((await res.json()) as { cover: string | null }[])[0].cover;
  };
  it("adds ?v=<8 hex> that changes with cover_path or pushed_at", async () => {
    const a = await cover(row("a.png", "t1"));
    expect(a).toMatch(/^\/img\/a\?v=[0-9a-f]{8}$/);
    expect(await cover(row("a.png", "t1"))).toBe(a);
    expect(await cover(row("b.png", "t1"))).not.toBe(a);
    expect(await cover(row("a.png", "t2"))).not.toBe(a);
    expect(await cover(row(null, "t1"))).toBeNull();
  });
});

describe("readmeExcerpt control chars", () => {
  it("strips control and bidi chars", () => expect(readmeExcerpt("Hello\u0000 wo\u202Erld\u2066!\u001b")).toBe("Hello world!"));
});

describe("/p and /img", () => {
  const shell = "<html><head><title>x</title></head></html>";
  const env = (rows: unknown[]) => ({ DB: fakeDb({ "FROM projects": rows }).db, GITHUB_OWNER: "o", ASSETS: { fetch: async () => new Response(shell) } }) as unknown as Env;
  it("/p/name/ equals /p/name; HEAD has no body", async () => {
    const e = env([{ name: "alpha", description: "d", tagline: null, cover_path: null }]);
    const g = await handleApi(new Request("http://x/p/alpha/"), e);
    expect(g.status).toBe(200);
    expect(await g.text()).toContain("alpha");
    const h = await handleApi(new Request("http://x/p/alpha", { method: "HEAD" }), e);
    expect(h.status).toBe(200);
    expect(await h.text()).toBe("");
    const miss = await handleApi(new Request("http://x/p/nope", { method: "HEAD" }), env([]));
    expect(miss.status).toBe(404);
  });
  it("HEAD /img/name: headers, no body", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } }));
    const e = env([{ repo: "o/alpha", cover_path: "c.png" }]);
    const h = await handleApi(new Request("http://x/img/alpha?v=abc", { method: "HEAD" }), e);
    expect(h.status).toBe(200);
    expect(h.headers.get("Content-Type")).toBe("image/png");
    expect(await h.text()).toBe("");
    const g = await handleApi(new Request("http://x/img/alpha"), e);
    expect((await g.arrayBuffer()).byteLength).toBe(3);
  });
  it("/img is exempt from the rate limiter", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const e = { ...env([]), RL: { limit } } as unknown as Env;
    expect((await handleApi(new Request("http://x/img/alpha"), e)).status).toBe(404);
    expect((await handleApi(new Request("http://x/api/health"), e)).status).toBe(429);
    expect(limit).toHaveBeenCalledTimes(1);
  });
});
