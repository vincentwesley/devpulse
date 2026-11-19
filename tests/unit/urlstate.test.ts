import { describe, expect, it } from "vitest";
import { parseHubPath, parseProjectPath, parseUrl, toHash, toHubPath, toProjectPath, toSearch } from "../../src/web/urlstate";

describe("url state", () => {
  it("parses filters and the dialog hash", () => {
    const s = parseUrl("?q=al&sort=stars&lang=Go&status=up&topic=vite", "#p/Beta%20%3Cb%3Ex%3C%2Fb%3E");
    expect(s).toEqual({ q: "al", sort: "stars", lang: "Go", status: "live", topic: "vite", stage: "", p: "Beta <b>x</b>" }); // legacy status=up maps to live
    expect(parseUrl("?status=down", "").status).toBe("failing");
    expect(parseUrl("?status=wip&sort=uptime", "")).toMatchObject({ status: "wip", sort: "uptime" });
  });
  it("falls back on junk", () => {
    expect(parseUrl("?sort=zzz&status=nope", "#p/%E0%A4%A")).toMatchObject({ sort: "active", status: "all", p: "" });
    expect(parseUrl("", "#projects").p).toBe("");
  });
  it("round-trips and omits defaults", () => {
    expect(toSearch({ q: "", sort: "active", lang: "", status: "all", topic: "", stage: "" })).toBe("");
    const v = { q: "a b", sort: "name" as const, lang: "C++", status: "failing" as const, topic: "x", stage: "live-up" as const };
    const { p, ...back } = parseUrl(toSearch(v), toHash("My App"));
    expect(back).toEqual(v);
    expect(p).toBe("My App");
    expect(toHash("")).toBe("");
  });
  it("stage filter accepts known stages and gaps only", () => {
    expect(parseUrl("?stage=gaps", "").stage).toBe("gaps");
    expect(parseUrl("?stage=released-extension", "").stage).toBe("released-extension");
    expect(parseUrl("?stage=bogus", "").stage).toBe("");
  });
  it("developer detail lives under /dev/p/, the hub story page under /p/", () => {
    expect(parseProjectPath("/dev/p/Alpha")).toBe("Alpha");
    expect(parseProjectPath("/dev/p/My%20App/")).toBe("My App");
    expect(parseProjectPath("/p/Alpha")).toBeNull();
    expect(parseProjectPath("/dev/")).toBeNull();
    expect(toProjectPath("My App")).toBe("/dev/p/My%20App");
    expect(parseHubPath("/p/Alpha")).toBe("Alpha");
    expect(parseHubPath("/dev/p/Alpha")).toBeNull();
    expect(toHubPath("a/b")).toBe("/p/a%2Fb");
  });
});
