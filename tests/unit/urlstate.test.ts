import { describe, expect, it } from "vitest";
import { parseMode, parseUrl, toHash, toSearch, withMode } from "../../src/web/urlstate";

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
  it("mode: parse and set without touching other params", () => {
    expect(parseMode("?mode=showcase")).toBe("showcase");
    expect(parseMode("?mode=dev")).toBe("dev");
    expect(parseMode("?mode=x")).toBeNull();
    expect(parseMode("")).toBeNull();
    expect(withMode("?q=a", "showcase")).toBe("?q=a&mode=showcase");
    expect(withMode("?mode=showcase&q=a", "dev")).toBe("?q=a");
    expect(withMode("", "dev")).toBe("");
  });
});
