// Bento strip: Featured, Pulse, Contributions, Totals, Languages. Each renderer fills its #tile-* element.
import "./bento.css";
import "./charts.css"; // shared .stats / .readout rows still used by the project page
import { add, el, link, show, type Heat, type Languages, type Project, type Res, type Stats, type Status } from "./api";
import { contribTile } from "./heatmap";
import { totalsTile } from "./hero";
import { ciFromState, initialOf, safeColor, sortFilter, tileBackground, tileColors } from "./hubutil";
import { langsTile } from "./languages";
import { navigate, navLink } from "./nav";
import { toProjectPath } from "./urlstate";

type S = "ok" | "attn" | "wip";
const failing = (p: Project) => p.ci?.conclusion === "failure" || p.ciState === "FAILURE" || p.ciState === "ERROR";

/** Repos with an open incident (the incident names a site; the site names its repo). */
export function incidentRepos(st: Status | null): Set<string> {
  const out = new Set<string>();
  for (const i of st?.incidents ?? []) if (i.end === null) out.add(st!.sites.find((s) => s.name === i.name)?.repo ?? i.name);
  return out;
}

/** attn = CI failing, site down or incident open; ok = green CI or site up; wip = pending CI or nothing known. */
export function pulseState(p: Project, open: Set<string> = new Set()): S {
  if (failing(p) || p.up === false || open.has(p.repo)) return "attn";
  if (p.ciState === "PENDING" || p.ciState === "EXPECTED" || p.ci?.status === "in_progress" || p.ci?.status === "queued") return "wip";
  return p.ciState === "SUCCESS" || p.ci?.conclusion === "success" || p.up === true ? "ok" : "wip";
}

export function pulseCounts(ps: Project[], open?: Set<string>): Record<S, number> {
  const n = { ok: 0, attn: 0, wip: 0 };
  for (const p of ps) n[pulseState(p, open)]++;
  return n;
}

/** "2d" / "5h" / "3w": compact age of an ISO timestamp; "" when missing/invalid. */
export function ageShort(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  const m = Math.max(0, Math.floor((now - t) / 6e4));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  if (m < 10080) return `${Math.floor(m / 1440)}d`;
  if (m < 43200) return `${Math.floor(m / 10080)}w`;
  return m < 525600 ? `${Math.floor(m / 43200)}mo` : `${Math.floor(m / 525600)}y`;
}

/** 'name · CI success · up 99.9% · pushed 2d' (parts without data are left out). */
export function pulseReadout(p: Project, now = Date.now()): string {
  const ci = p.ci ? p.ci.conclusion ?? p.ci.status : ciFromState(p.ciState)?.label;
  const up = !p.url ? "" : p.up === false ? "down" : p.uptime30d != null ? `up ${Math.floor(p.uptime30d * 10) / 10}%` : p.up ? "up" : "";
  const age = ageShort(p.pushedAt, now);
  return [p.name, ci ? `CI ${ci}` : "no CI", up, age && `pushed ${age}`].filter(Boolean).join(" · ");
}

/** Featured: the first `featured` project, else the most recently pushed repo. */
export const pickFeatured = (ps: Project[]): Project | undefined => sortFilter(ps, "active", "", "all")[0];

const LABEL: Record<S, string> = { ok: "Healthy", attn: "Needs attention", wip: "In progress" };

function media(p: Project) {
  const tile = () => {
    const t = el("div", "", "ft__media ft__tile", { "aria-hidden": "true" });
    t.style.background = tileBackground(tileColors(p.languages));
    add(t, el("span", initialOf(p.name), "ft__initial"));
    return t;
  };
  if (!p.cover?.startsWith("/img/")) return tile();
  const img = el("img", "", "ft__media", { src: p.cover, alt: "", width: "1200", height: "630", loading: "eager", decoding: "async", fetchpriority: "high" });
  img.addEventListener("error", () => img.replaceWith(tile()), { once: true });
  // The Worker answers a missing cover with a 404 SVG placeholder (intrinsic 40x21): swap it for the tile too.
  img.addEventListener("load", () => { if (img.naturalWidth === 40 && img.naturalHeight === 21) img.replaceWith(tile()); });
  return img;
}

function featured(p: Project) {
  const c = el("article", "", "ft");
  const b = el("div", "", "ft__body");
  const s = pulseState(p);
  const head = el("div", "", "ft__head");
  add(head, el("h3", p.name), el("span", LABEL[s], "dp-status", { "data-s": s }));
  add(b, head);
  const blurb = p.tagline ?? p.description;
  if (blurb) add(b, el("p", blurb, "ft__desc"));
  if (p.languages?.length) {
    const ul = el("ul", "", "ft__langs", { "aria-label": "Languages" });
    for (const l of p.languages.slice(0, 4)) {
      const li = el("li");
      const dot = el("i", "", "ft__dot", { "aria-hidden": "true" });
      dot.style.background = safeColor(l.color);
      add(li, dot, l.lang);
      add(ul, li);
    }
    add(b, ul);
  }
  const acts = el("div", "", "ft__acts");
  add(acts, navLink("View project", toProjectPath(p.name), "hs-btn", `View project ${p.name}`));
  if (p.url) add(acts, link("Live", p.url, "hs-btn ft__alt"));
  add(acts, link("Repo", `https://github.com/${p.repo}`, "hs-btn ft__alt"));
  add(b, acts);
  add(c, media(p), b);
  return c;
}

export function renderFeatured(projects: Res<Project[]>) {
  const tile = document.getElementById("tile-featured")!;
  if (tile.contains(document.activeElement)) return; // don't yank focus on a background refresh
  show("tile-featured", projects, (ps) => featured(pickFeatured(ps)!));
}

function pulse(ps: Project[], open: Set<string>) {
  const out = el("div", "", "pulse");
  const n = pulseCounts(ps, open);
  const sum = el("p", `${n.ok} ok · ${n.attn} need attention${n.wip ? ` · ${n.wip} in progress` : ""}`, "pulse__sum");
  const ul = el("ul", "", "pulse__grid", { "aria-label": "Repository status" });
  const readout = el("p", "Select a repo to open it.", "tile-readout", { "aria-live": "polite" });
  const cells = ps.map((p, i) => {
    const s = pulseState(p, open);
    const b = el("button", "", "pulse__cell", { type: "button", "data-s": s, tabindex: i ? "-1" : "0", "aria-label": `${p.name}: ${LABEL[s].toLowerCase()}` });
    add(b, el("span", "", "pulse__pix", { "aria-hidden": "true" }));
    const say = () => { readout.textContent = pulseReadout(p); };
    b.addEventListener("focus", say);
    b.addEventListener("pointerenter", say);
    b.addEventListener("click", () => navigate(toProjectPath(p.name)));
    const li = el("li");
    add(li, b);
    add(ul, li);
    return b;
  });
  ul.addEventListener("keydown", (e) => {
    const cur = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (cur < 0) return;
    const cols = cells.filter((c) => c.offsetTop === cells[0].offsetTop).length || 1;
    const to: Record<string, number> = { ArrowLeft: cur - 1, ArrowRight: cur + 1, ArrowUp: cur - cols, ArrowDown: cur + cols, Home: 0, End: cells.length - 1 };
    const next = to[e.key];
    if (next === undefined) return;
    e.preventDefault();
    if (next < 0 || next >= cells.length) return;
    cells[cur].tabIndex = -1;
    cells[next].tabIndex = 0;
    cells[next].focus();
  });
  add(out, sum, ul, readout);
  return out;
}

/** Pulse: one cell per repo, glyph + colour by status. */
export function renderPulse(projects: Res<Project[]>, status: Res<Status>) {
  const tile = document.getElementById("tile-pulse")!;
  if (tile.contains(document.activeElement)) return;
  show("tile-pulse", projects, (ps) => pulse(ps, incidentRepos(status.state === "ok" ? status.data : null)));
}

export function renderContrib(heat: Res<Heat>, stats: Res<Stats>) {
  const tile = document.getElementById("tile-contrib")!;
  if (tile.contains(document.activeElement)) return; // a redraw would reset the focused cell and scroll
  show("tile-contrib", heat, (h) => contribTile(h, stats.state === "ok" ? stats.data : null));
}

export function renderTotals(stats: Res<Stats>, _projects: Res<Project[]>) {
  show("tile-totals", stats, totalsTile);
}

export function renderLangs(langs: Res<Languages>) {
  show("tile-langs", langs, langsTile);
}
