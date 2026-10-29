import type { Env } from "./env";
import { LATENCY_POINTS, MAX_SITES, MAX_STATUS_ORIGINS, UPTIME_DAYS } from "./config";
import { parseDeps } from "./lib/github-parse";
import { pool, readBounded, TIMEOUT_MS, UA } from "./lib/http";
import { isUp, parseStatuspage, type PageStatus } from "./lib/statuspage";

const CONCURRENCY = 5;
const MAX_JSON = 256 * 1024;
const now = () => Math.floor(Date.now() / 1000);

export interface Check { project: string; ts: number; ok: number; status: number | null; ms: number }

export async function checkProject(repo: string, url: string): Promise<Check> {
  const t0 = Date.now();
  let status: number | null = null;
  let ok = 0;
  try {
    const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    status = r.status;
    ok = isUp(r.status) ? 1 : 0;
  } catch {}
  return { project: repo, ts: now(), ok, status, ms: Date.now() - t0 };
}

/**
 * Persist one run with a constant number of D1 statements (json_each, not one statement per site):
 * raw checks, today's daily rollup, incident open/close, and the uptime_summary row /api/projects reads.
 */
export async function recordChecks(env: Env, checks: Check[]): Promise<void> {
  if (!checks.length) return;
  const db = env.DB, t = now(), date = new Date(t * 1000).toISOString().slice(0, 10);
  const since = new Date((t - UPTIME_DAYS * 86400) * 1000).toISOString().slice(0, 10);
  const [prevLat, open] = (await db.batch([
    db.prepare("SELECT project, latency_json FROM uptime_summary"),
    db.prepare("SELECT project FROM incidents WHERE end_ts IS NULL"),
  ])) as { results: { project: string; latency_json?: string }[] }[];
  const lat = new Map(prevLat.results.map((r) => [r.project, r.latency_json ?? "[]"]));
  const isOpen = new Set(open.results.map((r) => r.project));
  const latest = (c: Check) => {
    let a: number[] = [];
    try { const p = JSON.parse(lat.get(c.project) ?? "[]"); if (Array.isArray(p)) a = p.filter((x) => typeof x === "number"); } catch {}
    return JSON.stringify([...a, c.ms].slice(-LATENCY_POINTS));
  };
  const rows = JSON.stringify(checks.map((c) => ({ p: c.project, ts: c.ts, ok: c.ok, s: c.status, ms: c.ms, lat: latest(c) })));
  const opens = JSON.stringify(checks.filter((c) => !c.ok && !isOpen.has(c.project)).map((c) => ({ p: c.project, ts: c.ts, s: c.status })));
  const closes = JSON.stringify(checks.filter((c) => c.ok && isOpen.has(c.project)).map((c) => c.project));
  await db.batch([
    db.prepare("INSERT INTO checks (project, ts, ok, status, ms) SELECT json_extract(value,'$.p'), json_extract(value,'$.ts'), json_extract(value,'$.ok'), json_extract(value,'$.s'), json_extract(value,'$.ms') FROM json_each(?)").bind(rows),
    db.prepare("INSERT INTO daily_uptime (project, date, up, total) SELECT json_extract(value,'$.p'), ?, json_extract(value,'$.ok'), 1 FROM json_each(?) WHERE true ON CONFLICT(project, date) DO UPDATE SET up = up + excluded.up, total = total + 1").bind(date, rows),
    db.prepare("UPDATE incidents SET end_ts = ? WHERE end_ts IS NULL AND project IN (SELECT value FROM json_each(?))").bind(t, closes),
    db.prepare("INSERT INTO incidents (project, start_ts, end_ts, status) SELECT json_extract(value,'$.p'), json_extract(value,'$.ts'), NULL, json_extract(value,'$.s') FROM json_each(?)").bind(opens),
    db.prepare(
      "INSERT INTO uptime_summary (project, up, uptime30d, latency_json, updated_at) SELECT json_extract(value,'$.p'), json_extract(value,'$.ok'), " +
        "(SELECT ROUND(100.0 * SUM(d.up) / SUM(d.total), 1) FROM daily_uptime d WHERE d.project = json_extract(value,'$.p') AND d.date >= ?), json_extract(value,'$.lat'), ? FROM json_each(?) WHERE true " +
        "ON CONFLICT(project) DO UPDATE SET up = excluded.up, uptime30d = excluded.uptime30d, latency_json = excluded.latency_json, updated_at = excluded.updated_at",
    ).bind(since, t, rows),
  ]);
}

/** One statuspage fetch (by the first url's origin) recorded for every dependency url sharing that origin. */
export async function checkStatuspage(env: Env, urls: string | string[]): Promise<void> {
  const list = [urls].flat();
  let s: PageStatus | null = null;
  try {
    const r = await fetch(`${new URL(list[0]).origin}/api/v2/status.json`, { redirect: "follow", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = r.ok ? await readBounded(r, MAX_JSON) : null;
    if (text) s = parseStatuspage(JSON.parse(text));
  } catch {}
  await env.DB.batch(list.map((url) => env.DB.prepare(
    "INSERT INTO api_status (url, name, indicator, description, ts) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(url) DO UPDATE SET name=excluded.name, indicator=excluded.indicator, description=excluded.description, ts=excluded.ts",
  ).bind(url, s?.name ?? url, s?.indicator ?? "unknown", s?.description ?? "", now())));
}

const originOf = (u: string) => { try { return new URL(u).origin; } catch { return u; } };

/** `max` items of `xs` starting at window `i` (wrapping), so n items are all covered every ceil(n/max) windows. */
export const rotate = <T>(xs: T[], max: number, i: number): T[] =>
  xs.length <= max ? xs : Array.from({ length: max }, (_, k) => xs[(((i * max) % xs.length) + k) % xs.length]);

/** Slot index of a 15-min cron slot (uptime rotation window). */
export const slotOf = (ms: number) => Math.floor(ms / 900_000);

export async function runUptime(env: Env, withStatuspages = false, slot = slotOf(Date.now())): Promise<void> {
  const { results } = await env.DB.prepare("SELECT repo, url, deps FROM projects ORDER BY pushed_at DESC, repo").all<{ repo: string; url: string | null; deps: string | null }>();
  // More than MAX_SITES sites (subrequest cap): rotate, so each site is checked every ceil(n / MAX_SITES) slots.
  const checks = await pool(rotate(results.filter((p) => p.url), MAX_SITES, slot), CONCURRENCY, (p) => checkProject(p.repo, p.url!));
  await recordChecks(env, checks);
  if (!withStatuspages) return;
  const byOrigin = new Map<string, string[]>();
  for (const u of new Set(results.flatMap((p) => parseDeps(p.deps ?? "[]")))) {
    const o = originOf(u);
    byOrigin.set(o, [...(byOrigin.get(o) ?? []), u]);
  }
  await pool([...byOrigin.values()].slice(0, MAX_STATUS_ORIGINS), CONCURRENCY, (urls) => checkStatuspage(env, urls));
}
