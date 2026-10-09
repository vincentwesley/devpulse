import type { Env } from "./env";
import { isUp, parseStatuspage } from "./lib/statuspage";

const CONCURRENCY = 5;
const now = () => Math.floor(Date.now() / 1000);

export async function checkProject(env: Env, repo: string, url: string): Promise<void> {
  const t0 = Date.now();
  let status: number | null = null;
  let ok = 0;
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    status = r.status;
    ok = isUp(r.status) ? 1 : 0;
  } catch {}
  await env.DB.prepare("INSERT INTO checks (project, ts, ok, status, ms) VALUES (?, ?, ?, ?, ?)")
    .bind(repo, now(), ok, status, Date.now() - t0).run();
}

const MAX_JSON = 256 * 1024;

export async function checkStatuspage(env: Env, url: string): Promise<void> {
  let s = null;
  let origin = url;
  try {
    origin = new URL(url).origin;
    const r = await fetch(`${origin}/api/v2/status.json`, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (r.ok && Number(r.headers.get("Content-Length")) <= MAX_JSON) {
      const text = await r.text();
      if (text.length <= MAX_JSON) s = parseStatuspage(JSON.parse(text));
    }
  } catch {}
  await env.DB.prepare(
    "INSERT INTO api_status (url, name, indicator, description, ts) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(url) DO UPDATE SET name=excluded.name, indicator=excluded.indicator, description=excluded.description, ts=excluded.ts",
  ).bind(url, s?.name ?? url, s?.indicator ?? "unknown", s?.description ?? "", now()).run();
}

async function pool<T>(items: T[], fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, q.length) }, async () => {
    for (let x = q.shift(); x !== undefined; x = q.shift()) await fn(x).catch(() => {});
  }));
}

export function parseDeps(raw: string | null): string[] {
  try {
    const a = JSON.parse(raw ?? "[]");
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}

export async function runUptime(env: Env): Promise<void> {
  const { results } = await env.DB.prepare("SELECT repo, url, deps FROM projects").all<{ repo: string; url: string | null; deps: string | null }>();
  const deps = new Set(results.flatMap((p) => parseDeps(p.deps)));
  await pool(results.filter((p) => p.url), (p) => checkProject(env, p.repo, p.url!));
  await pool([...deps], (u) => checkStatuspage(env, u));
}
