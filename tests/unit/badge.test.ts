import { describe, expect, it } from "vitest";
import { renderBadge, route, xml } from "../../src/worker/routes/badge";
import { handleApi } from "../../src/worker/api";
import type { Env } from "../../src/worker/env";
import { fakeDb } from "./_db";

const env = (rows: Record<string, unknown[]>) => ({ DB: fakeDb(rows).db }) as unknown as Env;
const get = (name: string, e: Env, method = "GET") => handleApi(new Request(`http://x/badge/${name}.svg`, { method }), e);

describe("xml escaping", () => {
  it("escapes all five specials", () => expect(xml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;"));
  it("renderBadge never emits raw markup from text", () => {
    const s = renderBadge(`</text><script>alert(1)</script>`, `"><img src=x onerror=1>`, "ok");
    expect(s).not.toContain("<script");
    expect(s).not.toContain("<img");
    expect(s).toContain("&lt;script&gt;");
    expect(s.match(/<svg/g)).toHaveLength(1);
  });
});

describe("GET /badge/:repo.svg", () => {
  const rows = (ci: string | null) => ({
    "FROM projects": [{ repo: "o/metalens", name: "metalens", url: "https://m.test", ci_state: ci, up: 1, uptime30d: 90 }],
  });
  it("renders svg with strict headers", async () => {
    const r = await get("metalens", env(rows("SUCCESS")));
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("Content-Security-Policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(r.headers.get("Cache-Control")).toBe("public, max-age=300");
    const t = await r.text();
    expect(t).toContain("metalens");
    expect(t).toContain("CI passing | up 90%");
  });
  it("tone follows CI/uptime", async () => {
    expect(await (await get("metalens", env(rows("FAILURE")))).text()).toContain("CI failing");
    expect(await (await get("metalens", env(rows(null)))).text()).toContain("no CI | up 90%");
  });
  it("strips control chars", () => expect(xml("a\x00b\x0Bc\x1Fd\uFFFEe\n")).toBe("abcde\n"));
  it("unknown name -> 404 grey svg, never cached", async () => {
    const r = await get("nope", env({}));
    expect(r.status).toBe(404);
    expect(r.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(await r.text()).toContain("unknown");
  });
  it("404 for invalid or hostile names (no DB lookup, not cached)", async () => {
    for (const bad of ["a%20b", "..%2Fx", "x".repeat(101), "a%3Cb", "o%2Fmetalens"]) {
      const lookups = fakeDb(rows("SUCCESS"));
      const r = await get(bad, { DB: lookups.db } as unknown as Env);
      expect(r.status, bad).toBe(404);
      expect(r.headers.get("Cache-Control"), bad).toBe("no-store");
      expect(lookups.ops.n, bad).toBe(0);
    }
  });
  it("non-GET and other paths -> null", async () => {
    expect(await route(new Request("http://x/badge/metalens.svg", { method: "POST" }), env({}), "/badge/metalens.svg")).toBeNull();
    expect(await route(new Request("http://x/badge/metalens"), env({}), "/badge/metalens")).toBeNull();
  });
});
