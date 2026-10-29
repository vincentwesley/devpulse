import type { Env } from "../env";
import { svg } from "../lib/http";
import type { Stage } from "../lib/stage";
import { xml } from "./badge";
import { loadProjects, type Project } from "./projects";

// Card palette (routes/card.ts) + one colour per stage.
export const STAGE_COLOR: Record<Stage, string> = {
  "live-up": "#4fe0a0", "live-down": "#ff6b6b", "live-pending": "#e9a07f", "released-extension": "#a996e0", active: "#7fb4e9", quiet: "#9aa59a", archived: "#6e7781",
};
const FONT = "Verdana,Geneva,DejaVu Sans,sans-serif";
const MAX = 40, ROW = 22, COL_W = 400, ONE_COL = 12;

/** Every public, non-archived repo (newest push first, <= 40) with a stage dot, name, stage and CI. Self-updating profile README image. */
export function renderGrid(ps: Project[]): string {
  const list = ps.filter((p) => !p.archived).sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? "") || a.name.localeCompare(b.name)).slice(0, MAX);
  const cols = list.length > ONE_COL ? 2 : 1, per = Math.ceil(list.length / cols) || 1;
  const w = cols * COL_W + 10, h = 44 + per * ROW + 12;
  const ci = (s: string | null) => (!s ? "" : s === "SUCCESS" ? "CI ✓" : s === "FAILURE" || s === "ERROR" ? "CI ✗" : "CI …");
  const rows = list.map((p, i) => {
    const x = 20 + Math.floor(i / per) * COL_W, y = 52 + (i % per) * ROW;
    return `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${STAGE_COLOR[p.stage]}"/>` +
      `<text x="${x + 18}" y="${y}" font-size="12" fill="#e6ede3">${xml(p.name.slice(0, 28))}</text>` +
      `<text x="${x + 240}" y="${y}" font-size="11" fill="#9aa59a">${xml(p.stage)}</text>` +
      `<text x="${x + 370}" y="${y}" font-size="11" fill="#a996e0" text-anchor="end">${xml(ci(p.ciState))}</text>`;
  }).join("");
  const label = `DevPulse: ${list.length} projects, ${list.filter((p) => p.stage === "live-up").length} live and up, ${list.filter((p) => p.stage === "live-down").length} down`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${xml(label)}"><title>${xml(label)}</title>` +
    `<rect width="${w}" height="${h}" fill="#11150e" stroke="#4fe0a0" stroke-width="2"/><g font-family="${FONT}">` +
    `<text x="20" y="28" font-size="15" font-weight="700" fill="#4fe0a0">Projects · DevPulse</text>` +
    (list.length ? rows : `<text x="20" y="52" font-size="12" fill="#9aa59a">no data yet</text>`) + "</g></svg>";
}

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET" || pathname !== "/grid.svg") return null;
  return svg(renderGrid(await loadProjects(env, new URL(req.url).origin)));
}
