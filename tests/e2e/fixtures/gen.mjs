// One-off generator for the fixtures (tests only). Run: node tests/e2e/fixtures/gen.mjs
import { writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url);
const w = (n, v) => writeFileSync(new URL(n, dir), JSON.stringify(v, null, 1));
const days = [];
const s = Date.parse("2025-10-10T00:00:00Z");
for (let i = 0; i < 365; i++) days.push({ date: new Date(s + i * 864e5).toISOString().slice(0, 10), count: (i * 7) % 11 > 6 ? (i % 5) + 1 : 0 });
w("heatmap.json", { days });
w("projects.json", [
  { repo: "vincentwesley/alpha", name: "Alpha", url: "https://alpha.example.com", up: true, uptime30d: 99.87, latencyMs: [120, 140, 110, 300, 150, 130],
    ci: { status: "completed", conclusion: "success", url: "https://github.com/o/alpha/actions/runs/1" },
    lighthouse: { week: "2026-W40", performance: 95, accessibility: 100, best_practices: 72, seo: 40 },
    deps: [{ url: "https://www.cloudflarestatus.com", name: "Cloudflare", indicator: "none" }, { url: "https://www.githubstatus.com", name: "GitHub", indicator: "major" }] },
  { repo: "vincentwesley/beta", name: "Beta <b>x</b>", url: "https://beta.example.com", up: false, uptime30d: 80.5, latencyMs: [200],
    ci: { status: "completed", conclusion: "failure", url: "https://github.com/o/beta/actions/runs/2" }, lighthouse: null, deps: [] },
  { repo: "vincentwesley/gamma", name: "Gamma", url: "https://gamma.example.com", up: null, uptime30d: null, latencyMs: [], ci: null, lighthouse: null, deps: [] },
]);
w("commits.json", [{ repo: "alpha", sha: "abc1234", message: "Fix thing\n\nbody", author: "vin", ts: "2026-10-08T10:00:00Z", url: "https://github.com/o/alpha/commit/abc1234" }]);
w("posts.json", [{ title: "Hello world", url: "https://vwesley.dev/blog/hello", published: "2026-09-30T00:00:00Z" }]);
