import { describe, expect, it } from "vitest";
import type { Project } from "../../src/web/api";
import { sameOriginImg } from "../../src/web/api";

const P = (o: Partial<Project>) => ({ repo: "o/x", name: "x", featured: false, pushedAt: null, shot: null, cover: null, ...o }) as Project;

describe("project hub helpers", () => {
  it("sameOriginImg keeps only /shot/ and /img/ paths", () => {
    expect(sameOriginImg("/shot/a.jpg?v=1")).toBe("/shot/a.jpg?v=1");
    expect(sameOriginImg("/img/a/0?v=1")).toBe("/img/a/0?v=1");
    expect(sameOriginImg("https://evil.test/x.png")).toBeNull();
    expect(sameOriginImg("//evil.test/x.png")).toBeNull();
    expect(sameOriginImg("javascript:alert(1)")).toBeNull();
    expect(sameOriginImg(null)).toBeNull();
  });
  it("gallery order: featured first, then newest push, then name", async () => {
    const { galleryOrder, bestImage } = await import("../../src/web/hub/hub"); // DOM is only touched inside functions
    const ps = [P({ name: "old", pushedAt: "2026-01-01T00:00:00Z" }), P({ name: "feat", featured: true, pushedAt: "2025-01-01T00:00:00Z" }), P({ name: "new", pushedAt: "2026-10-01T00:00:00Z" })];
    expect(galleryOrder(ps).map((p) => p.name)).toEqual(["feat", "new", "old"]);
    expect(bestImage(P({ shot: "/shot/x.jpg", cover: "/img/x" }))).toBe("/shot/x.jpg");
    expect(bestImage(P({ cover: "/img/x" }))).toBe("/img/x");
    expect(bestImage(P({ showcase: { summary: null, highlights: [], runThrough: { steps: [], commands: [] }, images: [{ url: "/img/x/0", alt: "" }] } }))).toBe("/img/x/0");
    expect(bestImage(P({}))).toBeNull();
  });
  it("kind: extension (stage or topic) wins over a live URL, then live site, else other", async () => {
    const { kindOf } = await import("../../src/web/hub/hub");
    expect(kindOf({ url: "https://x.test", stage: "live-up", topics: [] } as unknown as Project)).toBe("live");
    expect(kindOf({ url: null, stage: "released-extension", topics: [] } as unknown as Project)).toBe("ext");
    expect(kindOf({ url: "https://chromewebstore.google.com/x", stage: "live-up", topics: ["chrome-extension"] } as unknown as Project)).toBe("ext");
    expect(kindOf({ url: null, stage: "quiet", topics: ["firefox-addon"] } as unknown as Project)).toBe("ext");
    expect(kindOf({ url: null, stage: "active", topics: [] } as unknown as Project)).toBe("other");
  });
  it("updated: friendly relative wording, no clock numbers", async () => {
    const { updated } = await import("../../src/web/hub/hub");
    const now = Date.parse("2026-11-19T12:00:00Z");
    expect(updated("2026-11-19T01:00:00Z", now)).toBe("Updated today");
    expect(updated("2026-11-18T10:00:00Z", now)).toBe("Updated yesterday");
    expect(updated("2026-11-16T12:00:00Z", now)).toBe("Updated 3 days ago");
    expect(updated("2026-10-29T12:00:00Z", now)).toBe("Updated 3 weeks ago");
    expect(updated("2026-06-01T12:00:00Z", now)).toBe("Updated 6 months ago");
    expect(updated(null, now)).toBe("");
  });
});
