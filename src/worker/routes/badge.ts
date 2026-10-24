import type { Env } from "../env";
import { svg } from "../lib/http";

export const NAME = /^[A-Za-z0-9._-]{1,100}$/;
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

/** Grey "unknown" image with a 404 status. Unknown names are cached 300s; invalid names are not (bounded key space). */
export const notFoundSvg = (cache = true) => svg(renderBadge("devpulse", "unknown", "none"), 404, cache ? 300 : 0);

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET") return null;
  const m = /^\/badge\/(.+)\.svg$/.exec(pathname);
  if (!m) return null;
  if (!NAME.test(m[1])) return notFoundSvg(false);
  const p = await env.DB.prepare(
    "SELECT p.repo, p.name, p.url, p.ci_state, u.up, u.uptime30d FROM projects p LEFT JOIN uptime_summary u ON u.project = p.repo WHERE p.name = ?",
  ).bind(m[1]).first<{ repo: string; name: string; url: string | null; ci_state: string | null; up: number | null; uptime30d: number | null }>();
  if (!p) return notFoundSvg();

  const up = p.url && p.up != null ? !!p.up : null, pct = p.url ? p.uptime30d : null;
  const ci = p.ci_state === "SUCCESS" ? "CI passing" : p.ci_state === "FAILURE" || p.ci_state === "ERROR" ? "CI failing" : p.ci_state ? "CI pending" : "no CI";
  const site = up === null ? "" : `${up ? "up" : "down"}${pct == null ? "" : ` ${pct}%`}`;
  const tone = ci === "CI failing" || up === false ? "bad" : ci === "CI pending" ? "warn" : ci === "CI passing" || up ? "ok" : "none";
  return svg(renderBadge(p.name, site ? `${ci} | ${site}` : ci, tone));
}
