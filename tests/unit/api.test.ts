import { describe, expect, it } from "vitest";
import { handleApi } from "../../src/worker/api";
import type { Env } from "../../src/worker/env";

const call = (path: string) => handleApi(new Request("http://x" + path), {} as Env);

describe("api router", () => {
  it("health", async () => {
    const r = await call("/api/health");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
  it("404 json", async () => {
    const r = await call("/api/nope");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not found" });
  });
});
