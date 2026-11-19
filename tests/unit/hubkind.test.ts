import { describe, expect, it } from "vitest";
import type { Project } from "../../src/web/api";
import { firstSentence, getIt, matches, neighbours, pitchOf, related, showcaseScore, sortBy, splitHighlight, spotlight, titleOf } from "../../src/web/hub/kind";

const P = (o: Partial<Project>) => ({ repo: `o/${o.name ?? "x"}`, name: "x", url: null, stage: "active", topics: [], languages: [], featured: false, archived: false,
  pushedAt: null, tagline: null, description: null, release: null, links: [], ...o }) as Project;
const TS = { lang: "TypeScript", bytes: 1, color: "#3178c6", pct: 100 }, PY = { lang: "Python", bytes: 1, color: "#3572a5", pct: 100 };

describe("project hub: search, order, spotlight, related", () => {
  it("search: every word must appear in name, pitch, topics, languages or kind (case-insensitive)", () => {
    const p = P({ name: "koi-pond", tagline: "A living koi pond", topics: ["webgl2"], languages: [TS] });
    expect(matches(p, "")).toBe(true);
    expect(matches(p, "KOI")).toBe(true);
    expect(matches(p, "pond typescript")).toBe(true);
    expect(matches(p, "webgl2 experiment")).toBe(true);
    expect(matches(p, "pond rust")).toBe(false);
  });
  it("order: recently updated (then name) or A to Z, case-insensitive", () => {
    const ps = [P({ name: "beta", pushedAt: "2026-01-01T00:00:00Z" }), P({ name: "Alpha", pushedAt: "2025-01-01T00:00:00Z" }), P({ name: "gamma", pushedAt: "2026-06-01T00:00:00Z" })];
    expect(sortBy(ps, "recent").map((p) => p.name)).toEqual(["gamma", "beta", "Alpha"]);
    expect(sortBy(ps, "az").map((p) => p.name)).toEqual(["Alpha", "beta", "gamma"]);
  });
  it("spotlight: featured projects, else the three newest web apps; never archived", () => {
    const web = (n: string, d: string, o: Partial<Project> = {}) => P({ name: n, url: `https://${n}.test`, pushedAt: d, ...o });
    expect(spotlight([web("a", "2026-01-01"), web("b", "2026-03-01"), web("c", "2026-02-01"), web("d", "2026-04-01", { archived: true }), web("e", "2025-01-01"), P({ name: "lib", pushedAt: "2026-09-01" })]).map((p) => p.name)).toEqual(["b", "c", "a"]);
    expect(spotlight([web("a", "2026-01-01"), P({ name: "f", featured: true }), P({ name: "g", featured: true, archived: true })]).map((p) => p.name)).toEqual(["f"]);
  });
  it("spotlight without featured: pictures strongly first, then highlights + summary, then a live site, then recency", () => {
    const sc = (o: object = {}) => ({ title: null, summary: null, highlights: [], howItWorks: [], runThrough: { steps: [], commands: [] }, images: [], ...o });
    const ps = [
      P({ name: "thin-live", url: "https://t.test", pushedAt: "2026-11-18", showcase: sc() }), // newest, live, but no picture
      P({ name: "pic-plain", pushedAt: "2026-01-01", cover: "/img/pic-plain", showcase: sc() }),
      P({ name: "pic-rich", pushedAt: "2026-01-01", shot: "/shot/pic-rich.jpg", showcase: sc({ highlights: ["a", "b", "c"], summary: "x".repeat(300) }) }),
      P({ name: "pic-live", url: "https://p.test", pushedAt: "2026-02-01", showcase: sc({ images: [{ url: "/img/pic-live/0", alt: "" }] }) }),
      P({ name: "pic-old", pushedAt: "2025-01-01", cover: "/img/pic-old", showcase: sc() }),
    ];
    expect(spotlight(ps).map((p) => p.name)).toEqual(["pic-rich", "pic-live", "pic-plain"]); // 4 with pictures: thin-live never makes it
    expect(showcaseScore(ps[2])).toBeGreaterThan(showcaseScore(ps[3]));
    // Fewer than three with pictures: the rest may fill in, ranked after the pictured ones.
    expect(spotlight([ps[0], ps[1]]).map((p) => p.name)).toEqual(["pic-plain", "thin-live"]);
    expect(spotlight([ps[0], P({ name: "f", featured: true, showcase: sc() })]).map((p) => p.name)).toEqual(["f"]); // featured always wins
  });
  it("pitch: tagline, else description, else the README summary's first sentence (<= 160); title: README title, else repo name", () => {
    const summary = "A real-time black hole you can fly around. Every pixel traces light.";
    expect(pitchOf(P({ tagline: "T", description: "D" }))).toBe("T");
    expect(pitchOf(P({ description: "D" }))).toBe("D");
    expect(pitchOf(P({ showcase: { title: null, summary, highlights: [], runThrough: { steps: [], commands: [] }, images: [] } }))).toBe("A real-time black hole you can fly around.");
    expect(pitchOf(P({}))).toBeNull();
    expect(firstSentence(`${"long ".repeat(50)}.`)!.length).toBeLessThanOrEqual(160);
    expect(titleOf(P({ name: "llm-microscope", showcase: { title: "LLM Microscope", summary: null, highlights: [], runThrough: { steps: [], commands: [] }, images: [] } }))).toBe("LLM Microscope");
    expect(titleOf(P({ name: "x" }))).toBe("x");
    expect(matches(P({ name: "llm-microscope", showcase: { title: "LLM Microscope", summary: null, highlights: [], runThrough: { steps: [], commands: [] }, images: [] } }), "microscope llm")).toBe(true);
  });
  it("related: same kind first, then same main language; excludes itself, archived and the given names", () => {
    const me = P({ name: "me", languages: [TS] });
    const all = [me, P({ name: "exp1", languages: [PY], pushedAt: "2026-02-01" }), P({ name: "web-ts", url: "https://w.test", languages: [TS], pushedAt: "2026-03-01" }),
      P({ name: "web-py", url: "https://p.test", languages: [PY] }), P({ name: "exp-old", archived: true }), P({ name: "exp2", pushedAt: "2026-01-01" })];
    expect(related(me, all, ["exp2"]).map((p) => p.name)).toEqual(["exp1", "web-ts"]);
  });
  it("neighbours: previous and next in gallery order, wrapping; null when alone", () => {
    const all = [P({ name: "a", featured: true }), P({ name: "b", pushedAt: "2026-02-01" }), P({ name: "c", pushedAt: "2026-01-01" })];
    expect(neighbours(all[0], all)).toMatchObject({ prev: { name: "c" }, next: { name: "b" } });
    expect(neighbours(all[2], all)).toMatchObject({ prev: { name: "b" }, next: { name: "a" } });
    expect(neighbours(all[0], [all[0]])).toBeNull();
  });
  it("highlights: a short 'Label: text' prefix becomes a title; sentences with colons stay whole", () => {
    expect(splitHighlight("Reader view: strips clutter")).toEqual({ label: "Reader view", text: "strips clutter" });
    expect(splitHighlight("Works offline")).toEqual({ label: null, text: "Works offline" });
    expect(splitHighlight("It does this. Then: that")).toEqual({ label: null, text: "It does this. Then: that" });
  });
  it("get it: a store link for extensions, else the latest release, else nothing", () => {
    const ext = { stage: "released-extension" as const };
    expect(getIt(P({ ...ext, links: [{ label: "Store", url: "https://chromewebstore.google.com/detail/x/y" }] }))).toEqual({ label: "Get the extension", url: "https://chromewebstore.google.com/detail/x/y" });
    expect(getIt(P({ ...ext, name: "x", release: { tag: "v1", at: null } }))).toEqual({ label: "Download the latest release", url: "https://github.com/o/x/releases/latest" });
    expect(getIt(P({ ...ext }))).toBeNull();
    expect(getIt(P({ url: "https://x.test", release: { tag: "v1", at: null } }))).toBeNull();
  });
});
