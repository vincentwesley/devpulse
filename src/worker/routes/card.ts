import type { Env } from "../env";
import { canonicalName } from "../lib/alias";
import { redirect, svg } from "../lib/http";
import { NAME, notFoundSvg, xml } from "./badge";

const HEX = /^#[0-9a-fA-F]{6}$/;
const FONT = "Verdana,Geneva,DejaVu Sans,sans-serif";
interface P { name: string; description: string | null; stars: number | null; ci_state: string | null; url: string | null; tagline?: string | null }
interface L { lang: string; bytes: number; color: string | null }

/** github-readme-stats-style project card, 495x120. Every dynamic string goes through xml(); colours are validated hex. */
export function renderCard(p: P, langs: L[], up: boolean | null, pct: number | null): string {
  const total = langs.reduce((s, l) => s + l.bytes, 0);
  const top = [...langs].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  let x = 25;
  const bar = top.map((l) => {
    const wd = total ? Math.max(1, Math.round((l.bytes / total) * 445)) : 0;
    const r = `<rect x="${x}" y="68" width="${wd}" height="8" fill="${l.color && HEX.test(l.color) ? l.color : "#6e7781"}"/>`;
    x += wd;
    return r;
  }).join("");
  const legend = top.slice(0, 3).map((l, i) => `<text x="${25 + i * 120}" y="94" font-size="11" fill="#9aa59a">${xml(l.lang.slice(0, 14))} ${Math.round((l.bytes / total) * 100)}%</text>`).join("");
  const ci = p.ci_state === "SUCCESS" ? "CI passing" : p.ci_state === "FAILURE" || p.ci_state === "ERROR" ? "CI failing" : p.ci_state ? "CI pending" : "no CI";
  const site = up == null ? "" : ` · ${up ? "up" : "down"}${pct == null ? "" : ` ${pct}%`}`;
  const text = p.tagline || p.description || ""; // a declared tagline replaces the description line
  const desc = text.slice(0, 70) + (text.length > 70 ? "…" : "");
  const stars = `★ ${p.stars ?? 0}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="120" viewBox="0 0 495 120" role="img" aria-label="${xml(p.name)}: ${xml(ci + site)}"><title>${xml(p.name)}</title>` +
    `<rect width="495" height="120" fill="#11150e" stroke="#4fe0a0" stroke-width="2"/><g font-family="${FONT}">` +
    `<text x="25" y="30" font-size="16" font-weight="700" fill="#4fe0a0">${xml(p.name.slice(0, 40))}</text>` +
    `<text x="470" y="30" font-size="12" fill="#e9a07f" text-anchor="end">${xml(stars)}</text>` +
    `<text x="25" y="50" font-size="12" fill="#c8d2c4">${xml(desc)}</text>` +
    (total ? `${bar}${legend}` : "") +
    `<text x="470" y="108" font-size="11" fill="#a996e0" text-anchor="end">${xml(ci + site)}</text></g></svg>`;
}

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET") return null;
  const m = /^\/card\/(.+)\.svg$/.exec(pathname);
  if (!m) return null;
  if (!NAME.test(m[1])) return notFoundSvg();
  const n = await canonicalName(env, m[1]);
  if (!n) return notFoundSvg();
  if (n !== m[1]) return redirect(`/card/${n}.svg`);
  const [proj, langs, upt] = (await env.DB.batch([
    env.DB.prepare("SELECT name, description, stars, ci_state, url, tagline FROM projects WHERE name = ?").bind(n),
    env.DB.prepare("SELECT lang, bytes, color FROM languages WHERE repo = (SELECT repo FROM projects WHERE name = ?)").bind(n),
    env.DB.prepare("SELECT up, uptime30d FROM uptime_summary WHERE project = (SELECT repo FROM projects WHERE name = ?)").bind(n),
  ])) as { results: any[] }[];
  const p = proj.results[0] as P | undefined;
  if (!p) return notFoundSvg();
  const u = p.url ? upt.results[0] : undefined;
  return svg(renderCard(p, langs.results as L[], u ? !!u.up : null, u?.uptime30d ?? null));
}
