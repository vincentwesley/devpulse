// @ts-ignore no @types/node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFeed } from "../../src/worker/lib/rss";
// @ts-expect-error plain .mjs without types
import { median, weekId } from "../../scripts/lib.mjs";

const fx = (n: string) => readFileSync(new URL(`../fixtures/rss/${n}.xml`, import.meta.url), "utf8");

describe("parseFeed", () => {
  it("rss: skips items without link, tolerates missing date", () => {
    const r = parseFeed(fx("rss"));
    expect(r.map((x) => x.url)).toEqual(["https://ex.com/old", "https://ex.com/new", "https://ex.com/nodate"]);
    expect(r[1].published).toBe("2024-01-02T10:00:00.000Z");
    expect(r[2].published).toBe("");
  });
  it("atom: prefers alternate link, published over updated", () => {
    const r = parseFeed(fx("atom"));
    expect(r[0]).toEqual({ title: "Atom one", url: "https://ex.com/a1", published: "2024-02-01T00:00:00.000Z" });
    expect(r[1]).toMatchObject({ title: "Atom two", url: "https://ex.com/a2", published: "2024-04-01T10:00:00.000Z" });
  });
  it("cdata and entities", () => {
    const r = parseFeed(fx("cdata"));
    expect(r[0].title).toBe("Fish & <Chips>");
    expect(r[1].title).toBe("Tom & Jerry \u2019s A &bogus;");
  });
  it("garbage -> empty", () => expect(parseFeed("not xml")).toEqual([]));
});

describe("scripts/lib", () => {
  it("median", () => {
    expect(median([90, 70, 80])).toBe(80);
    expect(median([1, 2])).toBe(2);
  });
  it("weekId", () => {
    expect(weekId(new Date("2024-01-01T00:00:00Z"))).toBe("2024-W01");
    expect(weekId(new Date("2021-01-03T00:00:00Z"))).toBe("2020-W53");
    expect(weekId(new Date("2026-10-05T12:00:00Z"))).toBe("2026-W41");
  });
});
