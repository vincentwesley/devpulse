// One-off generator for the fixtures (tests only). Run: node tests/e2e/fixtures/gen.mjs
import { writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url);
const w = (n, v) => writeFileSync(new URL(n, dir), JSON.stringify(v, null, 1));
const days = [];
const s = Date.parse("2025-10-10T00:00:00Z");
for (let i = 0; i < 365; i++) days.push({ date: new Date(s + i * 864e5).toISOString().slice(0, 10), count: (i * 7) % 11 > 6 ? (i % 5) + 1 : 0 });
w("heatmap.json", { days });
const wk = (n) => Array.from({ length: 26 }, (_, i) => ({ week: 1760000000 + i * 604800, add: ((i * 37 + n) % 90) + 5, del: ((i * 53 + n) % 40) }));
const hub = (o) => ({ ciState: null, description: null, topics: [], language: null, stars: 0, forks: 0, createdAt: "2025-01-01T00:00:00Z", pushedAt: null, release: null, license: null, commitCount: null, loc: null, languages: [], codeFreq: [], tagline: null, featured: false, cover: null, readme: null, links: [], ...o });
w("projects.json", [
  hub({ repo: "vincentwesley/alpha", name: "Alpha", url: "https://alpha.example.com", up: true, uptime30d: 99.87, latencyMs: [120, 140, 110, 300, 150, 130],
    ci: { status: "completed", conclusion: "success", url: "https://github.com/o/alpha/actions/runs/1" },
    lighthouse: { week: "2026-W40", performance: 95, accessibility: 100, best_practices: 72, seo: 40 },
    deps: [{ url: "https://www.cloudflarestatus.com", name: "Cloudflare", indicator: "none" }, { url: "https://www.githubstatus.com", name: "GitHub", indicator: "major" }],
    description: "Alpha <i>tool</i> for testing", topics: ["vite", "cloudflare"], language: "TypeScript", stars: 7, forks: 2, license: "MIT", pushedAt: "2026-10-18T10:00:00Z",
    release: { tag: "v1.2.0", at: "2026-10-01T00:00:00Z" }, loc: 12345, commitCount: 80,
    languages: [{ lang: "TypeScript", bytes: 700, color: "#3178c6", pct: 70 }, { lang: "CSS", bytes: 300, color: "red; background:url(x)", pct: 30 }], codeFreq: wk(1),
    tagline: "Alpha ships tiny tools fast", featured: true, cover: "/img/alpha?v=0a1b2c3d",
    readme: ["Alpha is a test project.", "- fast builds", "- <img src=x onerror=window.__pwn=1>", "Second paragraph with <b>markup</b>."].join("\n"),
    links: [{ label: "Docs", url: "https://docs.example.com/alpha" }, { label: "Bad", url: "javascript:alert(1)" }] }),
  hub({ repo: "vincentwesley/beta", name: "Beta <b>x</b>", url: "https://beta.example.com", up: false, uptime30d: 80.5, latencyMs: [200],
    ci: { status: "completed", conclusion: "failure", url: "https://github.com/o/beta/actions/runs/2" }, lighthouse: null, deps: [],
    language: "Go", stars: 20, pushedAt: "2026-10-10T10:00:00Z", languages: [{ lang: "Go", bytes: 10, color: "#00ADD8", pct: 100 }], codeFreq: wk(2),
    tagline: "Beta has a broken cover", featured: true, cover: "/img/broken?v=deadbeef" }),
  hub({ repo: "vincentwesley/nosite", name: "NoSite", url: null, up: null, uptime30d: null, latencyMs: [], ci: null, ciState: "PENDING", lighthouse: null, deps: [],
    language: "TypeScript", pushedAt: "2026-09-01T00:00:00Z" }),
  hub({ repo: "vincentwesley/gamma", name: "Gamma", url: "https://gamma.example.com", up: null, uptime30d: null, latencyMs: [], ci: null, lighthouse: null, deps: [] }),
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
