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
