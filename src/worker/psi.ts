import type { Env } from "./env";
import { MAX_SITES, PSI_TIMEOUT_MS } from "./config";
import { pool } from "./lib/http";

const PSI = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CATS = ["performance", "accessibility", "best-practices", "seo"] as const;

export interface Scores { performance: number; accessibility: number; best_practices: number; seo: number }

/** PSI `lighthouseResult.categories.*.score` (0..1) -> 0..100 ints, or null if any category is missing. */
export function parsePsi(j: unknown): Scores | null {
  const c = (j as { lighthouseResult?: { categories?: Record<string, { score?: unknown }> } } | null)?.lighthouseResult?.categories;
  const s = CATS.map((k) => c?.[k]?.score);
  if (!s.every((x): x is number => typeof x === "number" && x >= 0 && x <= 1)) return null;
  const [performance, accessibility, best_practices, seo] = s.map((x) => Math.round(x * 100));
  return { performance, accessibility, best_practices, seo };
}

/** ISO week id "YYYY-Www" (UTC), the format of the `lighthouse.week` column. */
export function isoWeek(d: Date): string {
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)));
  const week = Math.floor((+thu - Date.UTC(thu.getUTCFullYear(), 0, 1)) / 864e5 / 7) + 1;
  return `${thu.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Weekly (Mon 01:00 UTC): one PageSpeed Insights call per monitored site, upserted into `lighthouse`. */
export async function runPsi(env: Env, now = new Date()): Promise<void> {
  const { results } = await env.DB.prepare("SELECT repo, url FROM projects WHERE url IS NOT NULL ORDER BY pushed_at DESC").all<{ repo: string; url: string }>();
  const week = isoWeek(now);
  const stmts = await pool(results.slice(0, MAX_SITES), 5, async (p) => {
    const qs = new URLSearchParams({ url: p.url, strategy: "mobile" });
    for (const c of CATS) qs.append("category", c);
    if (env.PSI_KEY) qs.set("key", env.PSI_KEY);
    const r = await fetch(`${PSI}?${qs}`, { signal: AbortSignal.timeout(PSI_TIMEOUT_MS) });
    if (!r.ok) throw new Error(`psi ${p.repo} ${r.status}`); // status only; the URL may hold the key
    const s = parsePsi(await r.json());
    if (!s) throw new Error(`psi ${p.repo} unparseable`);
    return env.DB.prepare(
      "INSERT INTO lighthouse (project, week, performance, accessibility, best_practices, seo) VALUES (?,?,?,?,?,?) " +
      "ON CONFLICT(project, week) DO UPDATE SET performance=excluded.performance, accessibility=excluded.accessibility, best_practices=excluded.best_practices, seo=excluded.seo",
    ).bind(p.repo, week, s.performance, s.accessibility, s.best_practices, s.seo);
  });
  if (stmts.length) await env.DB.batch(stmts);
}
