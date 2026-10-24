// STUB renderers for the bento strip (Builder B replaces the bodies, keeps the exports). Each fills its #tile-* element.
import "./hero.css";
import { add, el, show, type Heat, type Project, type Res, type Stats, type Status } from "./api";
import { windowDays } from "./heatmap";
import { heroTiles } from "./hero";
import { sortFilter } from "./hubutil";
import { renderLanguages } from "./languages";
import { featuredCard } from "./showcase";
import { compact } from "./ui";

/** Featured: first `showcase.featured` project, else the most recently pushed repo. */
export function renderFeatured(projects: Res<Project[]>) {
  const tile = document.getElementById("tile-featured")!;
  if (tile.contains(document.activeElement)) return; // don't yank focus on a background refresh
  show("tile-featured", projects, (ps) => featuredCard(sortFilter(ps, "active", "", "all")[0]));
}

const state = (p: Project): "ok" | "attn" | "wip" =>
  p.up === false || p.ci?.conclusion === "failure" || p.ciState === "FAILURE" || p.ciState === "ERROR" ? "attn" : p.ciState === "PENDING" ? "wip" : "ok";

/** Pulse: one cell per repo, glyph + colour by status. */
export function renderPulse(projects: Res<Project[]>, _status: Res<Status>) {
  show("tile-pulse", projects, (ps) => {
    const ul = el("ul", "", "pulse", { "aria-label": "Repository status" });
    for (const p of ps) {
      const s = state(p);
      const li = el("li", "", "pulse__cell dp-status", { "data-s": s, title: `${p.name}: ${s === "ok" ? "ok" : s === "attn" ? "needs attention" : "in progress"}` });
      add(li, el("span", p.name, "sr-only"));
      add(ul, li);
    }
    return ul;
  });
}

/** Contributions: 26-week count and streaks (heat strip comes with the real tile). */
export function renderContrib(heat: Res<Heat>, stats: Res<Stats>) {
  show("tile-contrib", heat, (h) => {
    const dl = el("dl", "", "hero__stats");
    const row = (k: string, v: string) => { const d = el("div", "", "hero__stat"); add(d, el("dt", k, "muted"), el("dd", v, "hero__num")); add(dl, d); };
    row("last 26 weeks", compact(windowDays(h.days, 26).reduce((n, d) => n + d.count, 0)));
    if (stats.state === "ok") { row("current streak (days)", String(stats.data.streak.current)); row("longest streak (days)", String(stats.data.streak.longest)); }
    return dl;
  });
}

/** Totals: repos, commits, lines changed (a zero figure is hidden). */
export function renderTotals(stats: Res<Stats>, _projects: Res<Project[]>) {
  show("tile-totals", stats, (s) => {
    const dl = el("dl", "", "hero__stats");
    for (const [label, n, fmt] of heroTiles(s).slice(0, 3)) {
      const d = el("div", "", "hero__stat");
      add(d, el("dt", label, "muted"), el("dd", fmt(n), "hero__num"));
      add(dl, d);
    }
    return dl;
  });
}

export const renderLangs = renderLanguages;
