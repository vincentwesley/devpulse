import type { Env } from "../env";
import { computeHealth, type JobRow } from "../lib/jobs";
import { json } from "../lib/http";

/** GET /api/health: job ages, stale flags, token days left. Never cached; 503 when D1 is unreachable. */
export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET" || pathname !== "/api/health") return null;
  try {
    const [jobs, exp] = (await env.DB.batch([env.DB.prepare("SELECT job, last_ok, last_err_code, last_err_at, alerted_at FROM jobs"), env.DB.prepare("SELECT value FROM meta WHERE key='token_exp'")])) as { results: any[] }[];
    const h = computeHealth(jobs.results as JobRow[], exp.results[0]?.value);
    return json({ ok: !h.stale, ...h }, 200);
  } catch {
    return json({ ok: false }, 503);
  }
}
