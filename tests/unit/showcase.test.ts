import { describe, expect, it } from "vitest";
import type { Project } from "../../src/web/api";
import { initialOf, readmeBlocks, sortFilter, tileBackground, tileColors } from "../../src/web/hubutil";
import { parseHubPath, parseProjectPath, toHubPath, toProjectPath } from "../../src/web/urlstate";

const mk = (name: string, featured: boolean, pushedAt: string | null) => ({ name, featured, pushedAt, stars: 0, topics: [], up: true }) as unknown as Project;

describe("tile helpers", () => {
  it("uses the top two language colours, strict hex only", () => {
    expect(tileColors([{ color: "#3178c6" }, { color: "#00ADD8" }])).toEqual(["#3178c6", "#00ADD8"]);
    expect(tileColors([{ color: "red; background:url(x)" }, { color: null }])).toEqual(["var(--accent)", "var(--accent)"]);
    expect(tileColors([{ color: "#3178c6" }])).toEqual(["#3178c6", "var(--fx-2)"]);
    expect(tileColors([])).toEqual(["var(--accent)", "var(--fx-2)"]);
    expect(tileColors(undefined)[0]).toBe("var(--accent)");
  });
  it("builds a gradient from them", () => {
    expect(tileBackground(["#111111", "#222222"])).toMatch(/^linear-gradient\(135deg, color-mix\(in srgb, #111111 55%.*#222222 30%/);
  });
  it("picks a readable initial", () => {
    expect(initialOf("alpha")).toBe("A");
    expect(initialOf("  <b>x")).toBe("B");
    expect(initialOf("9lives")).toBe("9");
    expect(initialOf("---")).toBe("?");
    expect(initialOf("")).toBe("?");
  });
});

describe("readmeBlocks", () => {
  it("splits lines into paragraphs and list items, skipping blanks", () => {
    expect(readmeBlocks("Intro line\n\n- one\n* two\n3. three\n• four\r\nplain")).toEqual([
      { kind: "p", text: "Intro line" },
      { kind: "li", text: "one" },
      { kind: "li", text: "two" },
      { kind: "li", text: "three" },
      { kind: "li", text: "four" },
      { kind: "p", text: "plain" },
    ]);
  });
  it("keeps markup as inert text and handles empty input and the cap", () => {
    expect(readmeBlocks("<img src=x onerror=alert(1)>")).toEqual([{ kind: "p", text: "<img src=x onerror=alert(1)>" }]);
    expect(readmeBlocks(null)).toEqual([]);
    expect(readmeBlocks("-dash")).toEqual([{ kind: "p", text: "-dash" }]);
    expect(readmeBlocks("a\nb\nc", 2)).toHaveLength(2);
  });
});

describe("project path", () => {
  it("parses and round-trips /dev/p/<name> (developer) and /p/<name> (hub)", () => {
    expect(parseProjectPath("/dev/p/Alpha")).toBe("Alpha");
    expect(parseProjectPath("/dev/p/Alpha/")).toBe("Alpha");
    expect(parseProjectPath(toProjectPath("Beta <b>x</b>"))).toBe("Beta <b>x</b>");
    expect(toProjectPath("a b")).toBe("/dev/p/a%20b");
    expect(parseHubPath(toHubPath("Beta <b>x</b>"))).toBe("Beta <b>x</b>");
  });
  it("rejects everything else", () => {
    for (const p of ["/", "/dev/", "/dev/p", "/dev/p/", "/dev/p/a/b", "/p/a", "/x/dev/p/a", "/dev/p/%E0%A4%A"]) expect(parseProjectPath(p), p).toBeNull();
    for (const p of ["/", "/p", "/p/", "/p/a/b", "/x/p/a", "/dev/p/a", "/p/%E0%A4%A"]) expect(parseHubPath(p), p).toBeNull();
  });
});
