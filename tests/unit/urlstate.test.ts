import { describe, expect, it } from "vitest";
import { parseUrl, toHash, toSearch } from "../../src/web/urlstate";

describe("url state", () => {
  it("parses filters and the dialog hash", () => {
    const s = parseUrl("?q=al&sort=stars&lang=Go&status=up&topic=vite", "#p/Beta%20%3Cb%3Ex%3C%2Fb%3E");
    expect(s).toEqual({ q: "al", sort: "stars", lang: "Go", status: "up", topic: "vite", p: "Beta <b>x</b>" });
  });
  it("falls back on junk", () => {
    expect(parseUrl("?sort=zzz&status=nope", "#p/%E0%A4%A")).toMatchObject({ sort: "active", status: "all", p: "" });
    expect(parseUrl("", "#projects").p).toBe("");
  });
  it("round-trips and omits defaults", () => {
    expect(toSearch({ q: "", sort: "active", lang: "", status: "all", topic: "" })).toBe("");
    const v = { q: "a b", sort: "name" as const, lang: "C++", status: "down" as const, topic: "x" };
    const { p, ...back } = parseUrl(toSearch(v), toHash("My App"));
    expect(back).toEqual(v);
    expect(p).toBe("My App");
    expect(toHash("")).toBe("");
  });
});
