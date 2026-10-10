import { describe, expect, it, vi } from "vitest";
import { handleApi } from "../../src/worker/api";
import type { Env } from "../../src/worker/env";

const call = (path: string) => handleApi(new Request("http://x" + path), {} as Env);

describe("api router", () => {
  it("health", async () => {
    const r = await call("/api/health");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
  it("500 json on route error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await call("/api/posts"); // env has no DB -> throws
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "internal error" });
  });
  it("404 json", async () => {
    const r = await call("/api/nope");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not found" });
  });
});

describe("headers and cache", () => {
  it("json responses carry nosniff + CSP", async () => {
    const r = await call("/api/health");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("Content-Security-Policy")).toBe("default-src 'none'; frame-ancestors 'none'");
  });
  it("edge cache keyed on pathname, query ignored", async () => {
    const store = new Map<string, Response>();
    vi.stubGlobal("caches", { default: {
      match: async (k: Request) => store.get(k.url)?.clone(),
      put: async (k: Request, r: Response) => void store.set(k.url, r),
    } });
    const env = { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) } } as unknown as Env;
    await handleApi(new Request("http://x/api/posts?a=1"), env);
    expect([...store.keys()]).toEqual(["http://x/api/posts"]);
    const r = await handleApi(new Request("http://x/api/posts?b=2"), {} as Env); // would 500 without cache
    expect(r.status).toBe(200);
    vi.unstubAllGlobals();
  });
});
