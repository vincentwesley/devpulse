import type { Env } from "./env";
import { MAX_SITES, MAX_STATUS_ORIGINS } from "./config";
import { parseDeps } from "./lib/github-parse";
import { pool, readBounded, TIMEOUT_MS, UA } from "./lib/http";
import { isUp, parseStatuspage, type PageStatus } from "./lib/statuspage";

const CONCURRENCY = 5;
const MAX_JSON = 256 * 1024;
const now = () => Math.floor(Date.now() / 1000);

export async function checkProject(env: Env, repo: string, url: string): Promise<D1PreparedStatement> {
  const t0 = Date.now();
  let status: number | null = null;
  let ok = 0;
  try {
    const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    status = r.status;
    ok = isUp(r.status) ? 1 : 0;
  } catch {}
  return env.DB.prepare("INSERT INTO checks (project, ts, ok, status, ms) VALUES (?, ?, ?, ?, ?)")
    .bind(repo, now(), ok, status, Date.now() - t0);
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

export async function runUptime(env: Env, withStatuspages = false): Promise<void> {
  const { results } = await env.DB.prepare("SELECT repo, url, deps FROM projects ORDER BY pushed_at DESC").all<{ repo: string; url: string | null; deps: string | null }>();
  // ponytail: only the MAX_SITES most recently pushed sites are monitored (subrequest cap); raise with a paid plan.
  const stmts = await pool(results.filter((p) => p.url).slice(0, MAX_SITES), CONCURRENCY, (p) => checkProject(env, p.repo, p.url!));
  if (stmts.length) await env.DB.batch(stmts);
  if (!withStatuspages) return;
  const byOrigin = new Map<string, string[]>();
  for (const u of new Set(results.flatMap((p) => parseDeps(p.deps ?? "[]")))) {
    const o = originOf(u);
    byOrigin.set(o, [...(byOrigin.get(o) ?? []), u]);
  }
  await pool([...byOrigin.values()].slice(0, MAX_STATUS_ORIGINS), CONCURRENCY, (urls) => checkStatuspage(env, urls));
}
