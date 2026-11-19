// One-off generator for the fixtures (tests only). Run: node tests/e2e/fixtures/gen.mjs
import { writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url);
const w = (n, v) => writeFileSync(new URL(n, dir), JSON.stringify(v, null, 1));
const days = [];
const s = Date.parse("2025-10-10T00:00:00Z");
for (let i = 0; i < 365; i++) days.push({ date: new Date(s + i * 864e5).toISOString().slice(0, 10), count: (i * 7) % 11 > 6 ? (i % 5) + 1 : 0 });
w("heatmap.json", { days });
const wk = (n) => Array.from({ length: 26 }, (_, i) => ({ week: 1760000000 + i * 604800, add: ((i * 37 + n) % 90) + 5, del: ((i * 53 + n) % 40) }));
const hub = (o) => ({ ciState: null, description: null, topics: [], language: null, stars: 0, forks: 0, createdAt: "2025-01-01T00:00:00Z", pushedAt: null, release: null, license: null, commitCount: null, loc: null, languages: [], codeFreq: [], tagline: null, featured: false, cover: null, readme: null, links: [],
  archived: false, stage: "active", stale: false, staleWhy: [], checkedAt: "2026-10-20T09:45:00Z", detailAt: "2026-10-19T00:30:00Z", uptimeAt: null, shotAt: null,
  urlSource: null, sheetId: null, audit: [], shot: null, snippet: "", showcase: { summary: null, highlights: [], runThrough: { steps: [], commands: [] }, images: [] }, ...o });
const snip = (n, live) => `<!-- devpulse:start -->\n[![${n} status card](https://devpulse.example/card/${n}.svg)](https://devpulse.example/p/${n})\n[![${n} live snapshot](https://devpulse.example/shot/${n}.jpg)](${live ?? `https://devpulse.example/p/${n}`})\n${live ? `**Live:** ${live} · ` : ""}**Health:** [DevPulse](https://devpulse.example/p/${n})\n<!-- devpulse:end -->`;
const PROJECTS = [
  hub({ repo: "vincentwesley/alpha", name: "Alpha", url: "https://alpha.example.com", up: true, uptime30d: 99.87, latencyMs: [120, 140, 110, 300, 150, 130],
    ci: { status: "completed", conclusion: "success", url: "https://github.com/o/alpha/actions/runs/1" },
    lighthouse: { week: "2026-W40", performance: 95, accessibility: 100, best_practices: 72, seo: 40 },
    deps: [{ url: "https://www.cloudflarestatus.com", name: "Cloudflare", indicator: "none" }, { url: "https://www.githubstatus.com", name: "GitHub", indicator: "major" }],
    description: "Alpha <i>tool</i> for testing", topics: ["vite", "cloudflare"], language: "TypeScript", stars: 7, forks: 2, license: "MIT", pushedAt: "2026-10-18T10:00:00Z",
    release: { tag: "v1.2.0", at: "2026-10-01T00:00:00Z" }, loc: 12345, commitCount: 80,
    languages: [{ lang: "TypeScript", bytes: 700, color: "#3178c6", pct: 70 }, { lang: "CSS", bytes: 300, color: "red; background:url(x)", pct: 30 }], codeFreq: wk(1),
    tagline: "Alpha ships tiny tools fast", featured: true, cover: "/img/alpha?v=0a1b2c3d",
    readme: ["Alpha is a test project.", "- fast builds", "- <img src=x onerror=window.__pwn=1>", "Second paragraph with <b>markup</b>."].join("\n"),
    links: [{ label: "Docs", url: "https://docs.example.com/alpha" }, { label: "Bad", url: "javascript:alert(1)" }],
    stage: "live-up", uptimeAt: "2026-10-20T09:45:00Z", shotAt: "2026-10-19T02:15:00Z", shot: "/shot/Alpha.jpg?v=1760840100", urlSource: "website", sheetId: "TOOL-01",
    snippet: snip("Alpha", "https://alpha.example.com"),
    showcase: { summary: "Alpha is a fixture project that ships tiny tools fast.\n\nIt exists only in tests.",
      highlights: ["Builds in under a second", "Zero <script>alert(1)</script> config", "Works offline"],
      runThrough: { steps: ["Clone the repo", "Install dependencies", "Start the dev server"], commands: ["npm ci", "npm run dev"] },
      images: [{ url: "/img/Alpha/0?v=0a1b2c3d", alt: "Alpha main screen" }, { url: "/img/Alpha/1?v=0a1b2c3d", alt: "Alpha settings" }] } }),
  hub({ repo: "vincentwesley/beta", name: "Beta <b>x</b>", url: "https://beta.example.com", up: false, uptime30d: 80.5, latencyMs: [200],
    ci: { status: "completed", conclusion: "failure", url: "https://github.com/o/beta/actions/runs/2" }, lighthouse: null, deps: [],
    language: "Go", stars: 20, pushedAt: "2026-10-10T10:00:00Z", languages: [{ lang: "Go", bytes: 10, color: "#00ADD8", pct: 100 }], codeFreq: wk(2),
    tagline: "Beta has a broken cover", featured: true, cover: "/img/broken?v=deadbeef",
    stage: "live-down", stale: true, staleWhy: ["uptime"], uptimeAt: "2026-10-20T07:00:00Z", urlSource: "pages", audit: ["website", "topics"], snippet: snip("Beta", "https://beta.example.com") }),
  hub({ repo: "vincentwesley/nosite", name: "NoSite", url: null, up: null, uptime30d: null, latencyMs: [], ci: null, ciState: "PENDING", lighthouse: null, deps: [],
    language: "TypeScript", pushedAt: "2026-09-01T00:00:00Z", stage: "quiet", audit: ["readme", "screenshot", "about", "website", "topics"], snippet: snip("NoSite", null) }),
  hub({ repo: "vincentwesley/gamma", name: "Gamma", url: "https://gamma.example.com", up: null, uptime30d: null, latencyMs: [], ci: null, lighthouse: null, deps: [],
    stage: "live-pending", urlSource: "readme", audit: ["screenshot"], snippet: snip("Gamma", "https://gamma.example.com") }),
];
w("projects.json", PROJECTS);
// Project Hub gallery fixture: the four above plus one of every kind (extension, library, tool, experiment, web apps, archived),
// some with and some without pictures, highlights and steps. Used by the hub specs only, so the dashboard specs keep their four rows.
const sc = (o) => ({ title: null, summary: null, highlights: [], howItWorks: [], runThrough: { steps: [], commands: [] }, images: [], ...o });
const TS = { lang: "TypeScript", bytes: 800, color: "#3178c6", pct: 80 }, CSS = { lang: "CSS", bytes: 200, color: "#563d7c", pct: 20 };
w("hub-projects.json", [...PROJECTS,
  hub({ repo: "vincentwesley/delta", name: "Delta", url: null, up: null, uptime30d: null, latencyMs: [], ci: null, lighthouse: null, deps: [],
    description: "A browser side panel fixture that tidies pages.", topics: ["chrome-extension", "manifest-v3", "privacy"], pushedAt: "2026-10-16T08:00:00Z",
    release: { tag: "v2.0.1", at: "2026-10-12T00:00:00Z" }, languages: [{ lang: "JavaScript", bytes: 900, color: "#f1e05a", pct: 90 }, { lang: "HTML", bytes: 100, color: "#e34c26", pct: 10 }],
    tagline: "Tidy any page from the side panel", stage: "released-extension", cover: "/img/Delta?v=11112222",
    links: [{ label: "Chrome Web Store", url: "https://chromewebstore.google.com/detail/delta/fixture" }],
    showcase: sc({ summary: "Delta is a fixture extension.", highlights: ["Reader view: strips clutter from the page", "Pause on this site: one click turns it off for a domain", "No account and no tracking"],
      images: [{ url: "/img/Delta/0?v=11112222", alt: "Delta side panel" }] }) }),
  hub({ repo: "vincentwesley/epsilon", name: "Epsilon", url: null, up: null, uptime30d: null, latencyMs: [], ci: null, lighthouse: null, deps: [],
    topics: ["library", "typescript", "parser"], pushedAt: "2026-10-14T08:00:00Z", languages: [TS],
    showcase: sc({ title: "Epsilon Parser", summary: "Epsilon parses things in tests. It is a fixture.", howItWorks: ["It tokenises the input.", "Then it builds a tree."], runThrough: { steps: ["Install the package", "Import the parser"], commands: ["npm install epsilon-fixture"] } }) }),
  hub({ repo: "vincentwesley/zeta", name: "Zeta", url: null, up: null, uptime30d: null, latencyMs: [], ci: null, lighthouse: null, deps: [],
    pushedAt: "2026-08-01T08:00:00Z", languages: [{ lang: "Python", bytes: 10, color: "#3572A5", pct: 100 }], stage: "quiet" }),
  hub({ repo: "vincentwesley/eta", name: "Eta", url: "https://eta.example.com", up: true, uptime30d: null, latencyMs: [], ci: null, lighthouse: null, deps: [],
    description: "A fixture web app with only a cover image.", topics: ["webgl2", "visualization"], pushedAt: "2026-10-17T08:00:00Z", languages: [TS, CSS],
    cover: "/img/Eta?v=33334444", stage: "live-up", urlSource: "package" }),
  hub({ repo: "vincentwesley/theta", name: "Theta", url: null, up: null, uptime30d: null, latencyMs: [], ci: null, lighthouse: null, deps: [],
    description: "A command-line tool fixture.", topics: ["cli", "compression"], pushedAt: "2026-09-20T08:00:00Z", languages: [TS],
    readme: "Theta squeezes files in tests.\n- Fast\n- Small" }),
  hub({ repo: "vincentwesley/iota", name: "Iota", url: "https://iota.example.com", up: true, uptime30d: null, latencyMs: [], ci: null, lighthouse: null, deps: [],
    tagline: "A fixture web app with a live snapshot", topics: ["maps", "open-data"], pushedAt: "2026-07-01T08:00:00Z", languages: [{ lang: "JavaScript", bytes: 10, color: "#f1e05a", pct: 100 }],
    shot: "/shot/Iota.jpg?v=1", stage: "live-up", urlSource: "readme" }),
  hub({ repo: "vincentwesley/old", name: "OldThing", url: null, up: null, uptime30d: null, latencyMs: [], ci: null, lighthouse: null, deps: [],
    description: "An archived fixture.", pushedAt: "2025-03-01T00:00:00Z", archived: true, stage: "archived" }),
]);
w("commits.json", [{ repo: "alpha", sha: "abc1234", message: "Fix thing\n\nbody", author: "vin", ts: "2026-10-08T10:00:00Z", url: "https://github.com/o/alpha/commit/abc1234" },
  { repo: "beta", sha: "def5678", message: "Beta only", author: "vin", ts: "2026-10-07T10:00:00Z", url: "https://github.com/o/beta/commit/def5678" }]);
w("posts.json", [{ title: "Hello world", url: "https://vwesley.dev/blog/hello", published: "2026-09-30T00:00:00Z" }]);
w("stats.json", { streak: { current: 12, longest: 40 }, busiestWeekday: "Tuesday", weekdayTotals: [3, 9, 14, 8, 7, 6, 2], contributionsThisYear: 812, mostActive30d: null, totals: { repos: 21, commits: 3456, loc: 123456 }, syncedAt: "2026-10-20T10:00:00Z", approx: false });
const sday = (i, up) => ({ date: new Date(Date.parse("2026-07-24T00:00:00Z") + i * 864e5).toISOString().slice(0, 10), up, total: 96 });
w("status.json", { sites: [
  { name: "Alpha", repo: "vincentwesley/alpha", url: "https://alpha.example.com", up: true, uptime90d: 99.9, days: Array.from({ length: 90 }, (_, i) => sday(i, i === 40 ? 90 : 96)) },
  { name: "Beta <b>x</b>", repo: "vincentwesley/beta", url: "https://beta.example.com", up: false, uptime90d: 80.5, days: Array.from({ length: 90 }, (_, i) => sday(i, i > 80 ? 60 : 96)) }],
  incidents: [{ name: "Beta <b>x</b>", start: "2026-10-12T10:00:00Z", end: null, status: 503 }] });
const L = (lang, color, pct) => ({ lang, bytes: pct * 1000, color, pct });
w("languages.json", { privateIncluded: true,
  public: [L("TypeScript", "#3178c6", 70), L("CSS", "#563d7c", 20), L("Weird", "javascript:x", 10)],
  all: [L("TypeScript", "#3178c6", 55), L("Python", "#3572a5", 30), L("CSS", "#563d7c", 10), L("Other", null, 5)] });
