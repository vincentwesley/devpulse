import type { Env } from "../env";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const sha = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

async function authed(req: Request, token: string): Promise<boolean> {
  const m = /^Bearer (.+)$/.exec(req.headers.get("Authorization") ?? "");
  if (!m) return false;
  const [a, b] = await Promise.all([sha(m[1]), sha(token)]);
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// Accepts "YYYY-Www" or an ISO date; returns "YYYY-Www" or null.
export function weekId(w: unknown): string | null {
  if (typeof w !== "string") return null;
  if (/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(w)) return w;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w)) return null;
  const d = new Date(w + "T00:00:00Z");
  if (isNaN(+d) || d.toISOString().slice(0, 10) !== w) return null;
  const thu = new Date(+d + (3 - ((d.getUTCDay() + 6) % 7)) * 864e5);
  const doy = Math.floor((+thu - Date.UTC(thu.getUTCFullYear(), 0, 1)) / 864e5);
  return `${thu.getUTCFullYear()}-W${String(Math.floor(doy / 7) + 1).padStart(2, "0")}`;
}

const KEYS = ["performance", "accessibility", "best_practices", "seo"] as const;

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (pathname !== "/api/ingest/lighthouse") return null;
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!env.INGEST_TOKEN) return json({ error: "ingest disabled" }, 503);
  if (!(await authed(req, env.INGEST_TOKEN))) return json({ error: "unauthorized" }, 401);

  if (Number(req.headers.get("Content-Length")) > 2048) return json({ error: "body too large" }, 413);
  const text = await req.text();
  if (text.length > 2048) return json({ error: "body too large" }, 413);
  let b: any;
  try { b = JSON.parse(text); } catch { return json({ error: "invalid json" }, 400); }
  const week = weekId(b?.week);
  const s = b?.scores;
  if (typeof b?.project !== "string" || !week || !s || typeof s !== "object" ||
      !KEYS.every((k) => Number.isInteger(s[k]) && s[k] >= 0 && s[k] <= 100)) {
    return json({ error: "invalid body" }, 400);
  }
  const known = await env.DB.prepare("SELECT 1 FROM projects WHERE repo = ?").bind(b.project).first();
  if (!known) return json({ error: "unknown project" }, 404);
  await env.DB.prepare(
    "INSERT INTO lighthouse (project, week, performance, accessibility, best_practices, seo) VALUES (?,?,?,?,?,?) " +
    "ON CONFLICT(project, week) DO UPDATE SET performance=excluded.performance, accessibility=excluded.accessibility, best_practices=excluded.best_practices, seo=excluded.seo",
  ).bind(b.project, week, s.performance, s.accessibility, s.best_practices, s.seo).run();
  return json({ ok: true });
}
