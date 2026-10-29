import { describe, expect, it } from "vitest";
import type { Project } from "../../src/web/api";
import { sameOriginImg } from "../../src/web/api";

const P = (o: Partial<Project>) => ({ repo: "o/x", name: "x", featured: false, pushedAt: null, shot: null, cover: null, ...o }) as Project;

describe("showcase helpers", () => {
  it("sameOriginImg keeps only /shot/ and /img/ paths", () => {
    expect(sameOriginImg("/shot/a.jpg?v=1")).toBe("/shot/a.jpg?v=1");
    expect(sameOriginImg("/img/a/0?v=1")).toBe("/img/a/0?v=1");
    expect(sameOriginImg("https://evil.test/x.png")).toBeNull();
    expect(sameOriginImg("//evil.test/x.png")).toBeNull();
    expect(sameOriginImg("javascript:alert(1)")).toBeNull();
    expect(sameOriginImg(null)).toBeNull();
  });
  it("gallery order: featured first, then newest push, then name", async () => {
    const { galleryOrder, bestImage } = await import("../../src/web/showcase-mode"); // DOM is only touched inside functions
    const ps = [P({ name: "old", pushedAt: "2026-01-01T00:00:00Z" }), P({ name: "feat", featured: true, pushedAt: "2025-01-01T00:00:00Z" }), P({ name: "new", pushedAt: "2026-10-01T00:00:00Z" })];
    expect(galleryOrder(ps).map((p) => p.name)).toEqual(["feat", "new", "old"]);
    expect(bestImage(P({ shot: "/shot/x.jpg", cover: "/img/x" }))).toBe("/shot/x.jpg");
    expect(bestImage(P({ cover: "/img/x" }))).toBe("/img/x");
    expect(bestImage(P({ showcase: { summary: null, highlights: [], runThrough: { steps: [], commands: [] }, images: [{ url: "/img/x/0", alt: "" }] } }))).toBe("/img/x/0");
    expect(bestImage(P({}))).toBeNull();
  });
});
