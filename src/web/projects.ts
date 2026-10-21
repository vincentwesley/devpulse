import * as d3 from "d3";
import "./hub.css";
import { add, el, fmtDate, getCommits, link, NODATA, show, type Commit, type Project, type Res } from "./api";
import { openDetail } from "./detail";
import { ciFromState, commitsFor, firstLine, relTime, safeColor, sortFilter, type Sort, type StatusFilter } from "./hubutil";

const LH: [keyof NonNullable<Project["lighthouse"]>, string][] = [
  ["performance", "Perf"], ["accessibility", "A11y"], ["best_practices", "Best"], ["seo", "SEO"],
];
const grade = (n: number) => (n >= 90 ? "good" : n >= 50 ? "ok" : "poor");
const gradeWord: Record<string, string> = { good: "good", ok: "needs work", poor: "poor" };

function spark(ms: number[], label = `Latency, last ${ms.length} checks: min ${d3.min(ms)} ms, max ${d3.max(ms)} ms`) {
  const w = 120, h = 28;
  const [lo, hi] = d3.extent(ms) as [number, number];
  const svg = d3.create("svg").attr("class", "spark-line").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img")
    .attr("aria-label", label);
  const x = d3.scaleLinear([0, Math.max(1, ms.length - 1)], [2, w - 2]);
  const y = d3.scaleLinear([lo, hi], [h - 3, 3]);
  svg.append("path").attr("fill", "none").attr("stroke", "currentColor").attr("stroke-width", 1.5)
    .attr("d", d3.line<number>().x((_, i) => x(i)).y((d) => (lo === hi ? h / 2 : y(d)))(ms));
  return svg.node() as unknown as SVGElement;
}

function card(p: Project, commits: Commit[]) {
  const c = el("article", "", "proj");
  const head = el("div", "", "proj__head");
  const h3 = el("h3");
  add(h3, link(p.name, p.url ?? `https://github.com/${p.repo}`));
  const pill = !p.url ? null : p.up === null ? el("span", NODATA, "pill pill--none") : el("span", p.up ? "▲ Up" : "▼ Down", `pill ${p.up ? "pill--up" : "pill--down"}`);
  add(head, h3);
  if (pill) add(head, pill);

  const stats = el("dl", "", "proj__stats");
  const row = (k: string, v: Node | string) => {
    const g = el("div");
    const dd = el("dd");
    add(dd, v);
    add(g, el("dt", k), dd);
    add(stats, g);
  };
  if (p.url) {
    row("Uptime 30d", p.uptime30d == null ? NODATA : `${p.uptime30d.toFixed(2)}%`);
    row("Latency", p.latencyMs?.length ? spark(p.latencyMs) : NODATA);
  }
  const ci = p.ci;
  const st = ciFromState(p.ciState);
  row("CI", ci ? link(ci.conclusion ?? ci.status, ci.url, `hs-chip ci ci--${ci.conclusion ?? ci.status}`)
    : st ? el("span", st.label, `hs-chip ci ci--${st.cls}`) : NODATA);
  if (p.loc != null) row("Lines changed (est.)", p.loc.toLocaleString("en"));

  const lh = el("div", "", "lh");
  if (p.lighthouse) {
    for (const [k, label] of LH) {
      const n = p.lighthouse[k] as number;
      const g = grade(n);
      add(lh, el("span", `${label} ${n} ${gradeWord[g]}`, `score score--${g}`));
    }
  } else add(lh, el("span", p.url ? `Lighthouse: ${NODATA}` : "no site to monitor", "muted"));

  const deps = el("ul", "", "deps", { "aria-label": "Dependency status" });
  for (const d of p.deps ?? []) {
    const li = el("li");
    add(li, link(`${d.name}: ${d.indicator}`, d.url, `hs-chip dep dep--${d.indicator}`));
    add(deps, li);
  }
  add(c, head);
  if (p.description) add(c, el("p", p.description, "hub-desc"));
  if (p.topics?.length) {
    const t = el("ul", "", "hub-topics", { "aria-label": "Topics" });
    for (const x of p.topics) add(t, el("li", x, "hs-chip hub-topic"));
    add(c, t);
  }
  if (p.languages?.length) {
    const bar = el("div", "", "hub-langbar", { role: "img", "aria-label": `Languages: ${p.languages.map((l) => `${l.lang} ${Math.round(l.pct)}%`).join(", ")}` });
    for (const l of p.languages) {
      const seg = el("span");
      seg.style.width = `${Math.max(0, l.pct)}%`;
      seg.style.background = safeColor(l.color);
      add(bar, seg);
    }
    add(c, bar);
  }
  const meta = el("p", "", "hub-meta");
  const bits = [p.language, `${p.stars} stars`, `${p.forks} forks`, p.license].filter(Boolean) as string[];
  add(meta, bits.join(" · "));
  if (p.release) add(meta, " · ", el("span", p.release.tag, "hs-chip hub-rel"));
  add(c, meta);
  if (p.pushedAt) add(c, el("p", `updated ${relTime(p.pushedAt)}`, "hub-meta", { title: fmtDate(p.pushedAt) }));
  add(c, stats);
  if (p.codeFreq?.length)
    add(c, spark(p.codeFreq.map((w) => w.add + w.del), `Lines changed per week, last ${p.codeFreq.length} weeks`));
  add(c, lh);
  if (deps.children.length) add(c, deps);
  const acts = el("div", "", "hub-actions");
  const more = el("button", "Details", "hs-btn hub-btn", { type: "button", "aria-label": `Details for ${p.name}` });
  more.addEventListener("click", () => openDetail(p, commits));
  add(acts, more);
  if (p.url) add(acts, link("Live", p.url, "hs-btn hub-btn hub-btn--alt"));
  add(acts, link("Repo", `https://github.com/${p.repo}`, "hs-btn hub-btn hub-btn--alt"));
  add(c, acts);
  return c;
}

function spotlight(ps: Project[], commits: Commit[]) {
  const p = [...ps].filter((x) => x.pushedAt).sort((a, b) => b.pushedAt!.localeCompare(a.pushedAt!))[0];
  if (!p) return null;
  const s = el("aside", "", "hub-spot hs-card", { "aria-label": "Now building" });
  add(s, el("p", "Now building", "hs-eyebrow"));
  const h = el("h3");
  add(h, link(p.name, `https://github.com/${p.repo}`));
  add(s, h);
  if (p.description) add(s, el("p", p.description, "hub-desc"));
  const last = commitsFor(p, commits)[0];
  add(s, el("p", `pushed ${relTime(p.pushedAt)}${last ? ` · ${firstLine(last.message)}` : ""}`, "muted", { title: fmtDate(p.pushedAt!) }));
  return s;
}

// Toolbar state survives the periodic re-render.
const view: { sort: Sort; lang: string; status: StatusFilter } = { sort: "active", lang: "", status: "all" };

function pick(label: string, opts: [string, string][], value: string, onChange: (v: string) => void) {
  const l = el("label", "", "hub-pick");
  const sel = el("select");
  for (const [v, t] of opts) add(sel, el("option", t, "", { value: v }));
  sel.value = value;
  sel.addEventListener("change", () => onChange(sel.value));
  add(l, el("span", label), sel);
  return l;
}

function hub(ps: Project[], commits: Commit[]) {
  const wrap = el("div");
  const grid = el("div", "", "grid");
  const draw = () => {
    grid.textContent = "";
    const list = sortFilter(ps, view.sort, view.lang, view.status);
    if (list.length) add(grid, ...list.map((p) => card(p, commits)));
    else add(grid, el("p", "no projects match", "muted", { role: "status" }));
  };
  const redraw = () => {
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(draw);
    else draw();
  };
  const langs = [...new Set(ps.map((p) => p.language).filter(Boolean) as string[])].sort();
  const bar = el("div", "", "hub-bar", { role: "group", "aria-label": "Project controls" });
  add(bar,
    pick("Sort", [["active", "Recently active"], ["stars", "Stars"], ["name", "Name"], ["status", "Status"]], view.sort, (v) => { view.sort = v as Sort; redraw(); }),
    pick("Language", [["", "All"], ...langs.map((l): [string, string] => [l, l])], view.lang, (v) => { view.lang = v; redraw(); }),
    pick("Status", [["all", "All"], ["up", "Up"], ["down", "Down"]], view.status, (v) => { view.status = v as StatusFilter; redraw(); }));
  const spot = spotlight(ps, commits);
  if (spot) add(wrap, spot);
  add(wrap, bar, grid);
  draw();
  return wrap;
}

export async function renderProjects(res: Res<Project[]>) {
  const c = await getCommits();
  show("projects", res, (ps) => hub(ps, c.state === "ok" ? c.data : []));
}
