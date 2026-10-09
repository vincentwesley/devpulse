import { execFileSync } from "node:child_process";
import { median, weekId } from "./lib.mjs";

const { DEVPULSE_URL, INGEST_TOKEN } = process.env;
if (!DEVPULSE_URL || !INGEST_TOKEN) throw new Error("DEVPULSE_URL and INGEST_TOKEN are required");

const CATS = { performance: "performance", accessibility: "accessibility", best_practices: "best-practices", seo: "seo" };
const week = weekId();
let failed = 0;

const projects = await (await fetch(`${DEVPULSE_URL}/api/projects`)).json();
for (const p of projects) {
  if (!p.url) continue;
  try {
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const out = execFileSync(process.execPath, ["node_modules/lighthouse/cli/index.js", p.url, "--output=json", "--quiet", "--chrome-flags=--headless --no-sandbox",
        "--only-categories=" + Object.values(CATS).join(",")], { encoding: "utf8", maxBuffer: 64e6, env: { PATH: process.env.PATH, HOME: process.env.HOME, CHROME_PATH: process.env.CHROME_PATH } });
      runs.push(JSON.parse(out).categories);
    }
    const scores = Object.fromEntries(Object.entries(CATS).map(([k, id]) =>
      [k, median(runs.map((r) => Math.round(r[id].score * 100)))]));
    const res = await fetch(`${DEVPULSE_URL}/api/ingest/lighthouse`, {
      method: "POST",
      headers: { Authorization: `Bearer ${INGEST_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ project: p.repo, week, scores }),
    });
    if (!res.ok) throw new Error(`ingest ${res.status}`);
    console.log(p.repo, scores);
  } catch (e) {
    failed++;
    console.error(`FAILED ${p.repo}: ${e.message}`);
  }
}
if (failed) process.exit(1);
