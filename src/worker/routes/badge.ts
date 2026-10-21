import type { Env } from "../env";
import { UPTIME_DAYS } from "../config";
import { json } from "../lib/http";

const NAME = /^[A-Za-z0-9._-]{1,100}$/;
export const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const COLORS = { ok: "#1f7a4d", warn: "#9a6700", bad: "#b3261e", none: "#6e7781" } as const;
// ponytail: width = chars * 6.6 (Verdana 11px average); long-tail glyphs can clip a pixel or two.
const w = (s: string) => Math.ceil(s.length * 6.6) + 12;

/** Fixed shields-style template; every interpolated string goes through xml(). */
export function renderBadge(label: string, message: string, tone: keyof typeof COLORS): string {
  const [l, m] = [xml(label.slice(0, 40)), xml(message.slice(0, 60))];
  const [lw, mw] = [w(label.slice(0, 40)), w(message.slice(0, 60))];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + mw}" height="20" role="img" aria-label="${l}: ${m}"><title>${l}: ${m}</title>` +
    `<rect width="${lw}" height="20" fill="#3a3f36"/><rect x="${lw}" width="${mw}" height="20" fill="${COLORS[tone]}"/>` +
    `<g fill="#fff" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle"><text x="${lw / 2}" y="14">${l}</text><text x="${lw + mw / 2}" y="14">${m}</text></g></svg>`;
}

const svg = (body: string) =>
  new Response(body, { headers: {
    "Content-Type": "image/svg+xml; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "Cross-Origin-Resource-Policy": "cross-origin",
  } });

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET") return null;
  const m = /^\/badge\/(.+)\.svg$/.exec(pathname);
  if (!m) return null;
  if (!NAME.test(m[1])) return json({ error: "not found" }, 404);
  const p = await env.DB.prepare("SELECT repo, name, url, ci_state FROM projects WHERE name = ?").bind(m[1]).first<{ repo: string; name: string; url: string | null; ci_state: string | null }>();
  if (!p) return json({ error: "not found" }, 404);

  let up: boolean | null = null, pct: number | null = null;
  if (p.url) {
    const since = Math.floor(Date.now() / 1000) - UPTIME_DAYS * 86400;
    const [last, agg] = (await env.DB.batch([
      env.DB.prepare("SELECT ok FROM checks WHERE project = ? ORDER BY ts DESC LIMIT 1").bind(p.repo),
      env.DB.prepare("SELECT COUNT(*) AS n, SUM(ok) AS up FROM checks WHERE project = ? AND ts >= ?").bind(p.repo, since),
    ])) as { results: any[] }[];
    if (last.results[0]) up = !!last.results[0].ok;
    const a = agg.results[0];
    if (a?.n) pct = Math.round((a.up / a.n) * 1000) / 10;
  }
  const ci = p.ci_state === "SUCCESS" ? "CI passing" : p.ci_state === "FAILURE" || p.ci_state === "ERROR" ? "CI failing" : p.ci_state ? "CI pending" : "no CI";
  const site = up === null ? "" : `${up ? "up" : "down"}${pct === null ? "" : ` ${pct}%`}`;
  const tone = ci === "CI failing" || up === false ? "bad" : ci === "CI pending" ? "warn" : ci === "CI passing" || up ? "ok" : "none";
  return svg(renderBadge(p.name, site ? `${ci} | ${site}` : ci, tone));
}
