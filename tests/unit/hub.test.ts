import { describe, expect, it } from "vitest";
import { gapsOf, readmeGaps, relImage } from "../../src/worker/lib/audit";
import { parseReadmeShowcase, readShowcase } from "../../src/worker/lib/showcase-readme";
import { snippet } from "../../src/worker/lib/snippet";
import { stageOf, staleOf } from "../../src/worker/lib/stage";

const NOW = Date.parse("2026-10-29T03:00:00Z");
const base = { archived: false, url: null, up: null, incidentOpen: false, topics: [], kind: null, release: false, pushedAt: "2026-10-20T00:00:00Z" };

describe("stage", () => {
  it("first matching rule wins", () => {
    expect(stageOf({ ...base, archived: true, url: "https://x.dev", up: true }, NOW)).toBe("archived");
    expect(stageOf({ ...base, url: "https://x.dev", up: false }, NOW)).toBe("live-down");
    expect(stageOf({ ...base, url: "https://x.dev", up: true, incidentOpen: true }, NOW)).toBe("live-down");
    expect(stageOf({ ...base, url: "https://x.dev", up: true }, NOW)).toBe("live-up");
    expect(stageOf({ ...base, url: "https://x.dev" }, NOW)).toBe("live-pending");
    expect(stageOf({ ...base, topics: ["chrome-extension"], release: true }, NOW)).toBe("released-extension");
    expect(stageOf({ ...base, kind: "extension", release: true, pushedAt: "2025-01-01T00:00:00Z" }, NOW)).toBe("released-extension");
    expect(stageOf({ ...base, kind: "extension" }, NOW)).toBe("active"); // no release yet
    expect(stageOf(base, NOW)).toBe("active");
    expect(stageOf({ ...base, pushedAt: "2026-09-28T00:00:00Z" }, NOW)).toBe("quiet");
    expect(stageOf({ ...base, pushedAt: null }, NOW)).toBe("quiet");
  });
  it("stale: list > 45 min, overdue site check (scaled by rotation), detail pending past its daily slot + 2 h", () => {
    const ok = { listAt: "2026-10-29T02:50:00Z", url: null, uptimeAt: null, sitesPerCycle: 1, pushedAt: "2026-10-28T00:00:00Z", updatedAt: null, detailAt: "2026-10-28T01:00:00Z" };
    expect(staleOf(ok, NOW)).toEqual({ stale: false, why: [] });
    expect(staleOf({ ...ok, listAt: "2026-10-29T02:00:00Z" }, NOW).why).toEqual(["list"]);
    expect(staleOf({ ...ok, listAt: null }, NOW).why).toEqual(["list"]);
    const t = NOW / 1000;
    expect(staleOf({ ...ok, url: "https://x.dev", uptimeAt: t - 3000 }, NOW).why).toEqual(["uptime"]);
    expect(staleOf({ ...ok, url: "https://x.dev", uptimeAt: t - 3000, sitesPerCycle: 2 }, NOW).why).toEqual([]);
    expect(staleOf({ ...ok, url: "https://x.dev", uptimeAt: null }, NOW).why).toEqual(["uptime"]);
    // pushed after the read: allowed to wait until read + 24 h, then 2 h of grace
    expect(staleOf({ ...ok, pushedAt: "2026-10-28T12:00:00Z", detailAt: "2026-10-28T10:00:00Z" }, NOW).why).toEqual([]);
    expect(staleOf({ ...ok, pushedAt: "2026-10-28T00:30:00Z", detailAt: "2026-10-28T00:00:00Z" }, NOW).why).toEqual(["detail"]);
    expect(staleOf({ ...ok, detailAt: null, pushedAt: "2026-10-29T02:30:00Z" }, NOW).why).toEqual([]);
    expect(staleOf({ ...ok, detailAt: null, pushedAt: "2026-10-28T02:30:00Z" }, NOW).why).toEqual(["detail"]);
  });
});

describe("audit", () => {
  const prose = "DevPulse is a public dashboard that shows the health of every deployed project: commits, CI, uptime, Lighthouse and dependency status, refreshed automatically from GitHub every fifteen minutes on free tiers.";
  it("README gaps: explanation length and a non-badge image", () => {
    expect(readmeGaps(null)).toEqual(["readme", "screenshot"]);
    expect(readmeGaps("# x\n\n![CI](https://github.com/o/x/actions/workflows/ci.yml/badge.svg) ![l](https://img.shields.io/badge/x-y-z)\n\nShort.")).toEqual(["readme", "screenshot"]);
    expect(readmeGaps(`# x\n\n${prose}\n\n![The dashboard](docs/screens/m1.png)`)).toEqual([]);
    expect(readmeGaps(`# x\n\n${prose}\n\n<img src="https://example.com/shot.png" alt="s">`)).toEqual([]);
  });
  it("all gaps combine stored README gaps with description, Website field and topics", () => {
    expect(gapsOf({ audit: "[]", description: "d", homepage: "https://x.dev", topics: ["a"] })).toEqual([]);
    expect(gapsOf({ audit: '["screenshot"]', description: " ", homepage: "https://github.com/o/x", topics: ["devpulse-ignore"] })).toEqual(["screenshot", "about", "website", "topics"]);
    expect(gapsOf({ audit: null, description: "d", homepage: "https://x.dev", topics: ["a"] })).toEqual(["readme", "screenshot"]); // never read yet
  });
  it("relative image paths only", () => {
    expect(relImage("./docs/screens/a.png")).toBe("docs/screens/a.png");
    expect(relImage("docs/a.png?raw=true")).toBe("docs/a.png");
    expect(relImage("../a.png")).toBeNull();
    expect(relImage("https://x.dev/a.png")).toBeNull();
    expect(relImage("logo.svg")).toBeNull();
  });
});

describe("snippet", () => {
  it("card, snapshot linked to the live site, live + DevPulse links between markers", () => {
    const s = snippet("https://d.dev", "koi-pond", "https://o.github.io/koi-pond/");
    expect(s).toBe([
      "<!-- devpulse:start -->",
      "[![koi-pond status on DevPulse](https://d.dev/card/koi-pond.svg)](https://d.dev/p/koi-pond)",
      "",
      "[![Current screenshot of koi-pond](https://d.dev/shot/koi-pond.jpg)](https://o.github.io/koi-pond/)",
      "",
      "[Live site](https://o.github.io/koi-pond/) · [Health on DevPulse](https://d.dev/p/koi-pond)",
      "<!-- devpulse:end -->",
    ].join("\n"));
    expect(snippet("https://d.dev", "x", null)).toContain("](https://d.dev/p/x)\n\n[Health on DevPulse]");
    expect(snippet("https://d.dev", "x", "https://x.dev/a(b)")).toContain("https://x.dev/a%28b%29");
  });
});

describe("README showcase parser", () => {
  const md = `# Koi Pond

[![CI](https://github.com/o/koi/actions/workflows/ci.yml/badge.svg)](x) ![MIT](https://img.shields.io/badge/license-MIT-blue)

An **interactive** WebGL2 koi pond: ripples, lily pads and [fish](https://x.dev) that follow your cursor.

It runs in any modern browser with no install.

![The pond at night](docs/screens/night.png)

## Features

- Real-time *ripples* on a height field
- Lily pads you can drag
1. Day and night themes

## Getting started

1. Clone the repo
2. Install dependencies

\`\`\`bash
$ npm install
$ npm run dev
\`\`\`

## Licence

MIT <img src="docs/screens/day.jpg" alt="Daytime">
`;
  it("summary, highlights, run-through and images from real README text only", () => {
    expect(parseReadmeShowcase(md)).toEqual({
      summary: "An interactive WebGL2 koi pond: ripples, lily pads and fish that follow your cursor.\n\nIt runs in any modern browser with no install.",
      highlights: ["Real-time ripples on a height field", "Lily pads you can drag", "Day and night themes"],
      runThrough: { steps: ["Clone the repo", "Install dependencies"], commands: ["npm install", "npm run dev"] },
      images: [{ path: "docs/screens/night.png", alt: "The pond at night" }, { path: "docs/screens/day.jpg", alt: "Daytime" }],
    });
  });
  it("falls back to the first bullet list; empty when absent; caps and strips control/bidi chars", () => {
    const p = parseReadmeShowcase("# t\n\nIntro line.\n\n- one\n- two‮\n\n## Notes\n\nmore");
    expect(p.highlights).toEqual(["one", "two"]);
    expect(p.runThrough).toEqual({ steps: [], commands: [] });
    expect(parseReadmeShowcase(null)).toEqual({ summary: null, highlights: [], runThrough: { steps: [], commands: [] }, images: [] });
    const long = parseReadmeShowcase(`# t\n\n${"word ".repeat(300)}\n\n## Features\n\n${Array.from({ length: 12 }, (_, i) => `- item ${i} ${"x".repeat(200)}`).join("\n")}`);
    expect(long.summary!.length).toBeLessThanOrEqual(600);
    expect(long.highlights).toHaveLength(8);
    expect(long.highlights.every((h) => h.length <= 160)).toBe(true);
  });
  it("readShowcase tolerates junk and drops unsafe image paths", () => {
    expect(readShowcase("nope").images).toEqual([]);
    expect(readShowcase(JSON.stringify({ summary: "s", images: [{ path: "../x.png", alt: "a" }, { path: "a.png", alt: 1 }] }))).toEqual({ summary: "s", highlights: [], runThrough: { steps: [], commands: [] }, images: [{ path: "a.png", alt: "" }] });
  });
});
