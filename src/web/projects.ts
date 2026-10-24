import * as d3 from "d3";
import "./hub.css";
import { add, el, fmtDate, link, NODATA, show, type Commit, type Project, type Res } from "./api";
import { closeDetail, openDetail, openName } from "./detail";
import { ciFromState, commitsFor, firstLine, plural, relTime, safeColor, sortFilter, type Sort, type StatusFilter } from "./hubutil";
import { setPaletteProjects } from "./palette";
import { DEFAULT_VIEW, parseUrl, toSearch } from "./urlstate";

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

// Toolbar state, seeded from the URL, survives the periodic re-render.
const { p: _p, ...seed } = parseUrl(location.search, "");
const view: typeof DEFAULT_VIEW = seed;
const saveUrl = () => history.replaceState(history.state, "", location.pathname + toSearch(view) + location.hash);

function card(p: Project, commits: Commit[], onTopic: (t: string) => void) {
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
  } else add(lh, p.url ? el("span", `Lighthouse: ${NODATA}`, "muted") : el("span", "no live site", "hs-chip hub-nosite"));

  const deps = el("ul", "", "deps", { "aria-label": "Dependency status" });
  for (const d of p.deps ?? []) {
    const li = el("li");
    add(li, link(`${d.name}: ${d.indicator}`, d.url, `hs-chip dep dep--${d.indicator}`));
    add(deps, li);
  }
  add(c, head);
  if (p.description) add(c, el("p", p.description, "hub-desc"));
  if (p.topics?.length) {
    const t = el("ul", "", "hub-topics", { "aria-label": "Topics (select to filter)" });
    for (const x of p.topics) {
      const li = el("li");
      const b = el("button", x, "hs-chip hub-topic", { type: "button", "aria-pressed": String(view.topic === x) });
      b.addEventListener("click", () => onTopic(x));
      add(li, b);
      add(t, li);
    }
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
  const bits = [p.language, p.stars > 0 ? plural(p.stars, "star") : null, p.forks > 0 ? plural(p.forks, "fork") : null, p.commitCount != null ? plural(p.commitCount, "commit") : null, p.license].filter(Boolean) as string[];
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

function pick(label: string, opts: [string, string][], value: string, onChange: (v: string) => void) {
  const l = el("label", "", "hub-pick");
  const sel = el("select");
  for (const [v, t] of opts) add(sel, el("option", t, "", { value: v }));
  sel.value = value;
  sel.addEventListener("change", () => onChange(sel.value));
  add(l, el("span", label), sel);
  return l;
}

// Latest data, so popstate / hashchange can open the dialog for #p/<name>.
let cur: { ps: Project[]; commits: Commit[] } = { ps: [], commits: [] };
function syncDialog() {
  const name = parseUrl("", location.hash).p;
  if (!name) return closeDetail();
  if (name === openName()) return;
  const p = cur.ps.find((x) => x.name === name);
  if (p) openDetail(p, cur.commits);
}
addEventListener("popstate", syncDialog);
addEventListener("hashchange", syncDialog);

function hub(ps: Project[], commits: Commit[]) {
  const wrap = el("div");
  const grid = el("div", "", "grid");
  const count = el("p", "", "muted hub-count", { role: "status" });
  const langs = [...new Set(ps.map((p) => p.language).filter(Boolean) as string[])].sort();
  const topics = [...new Set(ps.flatMap((p) => p.topics ?? []))].sort();
  const bar = el("div", "", "hub-bar", { role: "group", "aria-label": "Project controls" });
  const search = el("input", "", "", { type: "search", id: "hub-q", name: "q", placeholder: "Search projects", autocomplete: "off", maxlength: "100" });
  search.value = view.q;
  const sl = el("label", "", "hub-search");
  add(sl, el("span", "Search", "hub-lbl"), search);
  const filters = el("details", "", "hub-filters");
  const sum = el("summary", "Filters", "hs-btn hub-btn hub-btn--alt");
  const fbody = el("div", "", "hub-fbody");
  const clear = el("button", "Clear filters", "hs-btn hub-btn hub-btn--alt", { type: "button" });
  const active = () => [view.q, view.lang, view.topic, view.status !== "all" ? "x" : "", view.sort !== "active" ? "x" : ""].filter(Boolean).length;

  const draw = () => {
    grid.textContent = "";
    const list = sortFilter(ps, view.sort, view.lang, view.status, view.q, view.topic);
    if (list.length) add(grid, ...list.map((p) => card(p, commits, setTopic)));
    else add(grid, el("p", "no projects match", "muted", { role: "status" }));
    count.textContent = `${list.length} of ${plural(ps.length, "project")}`;
    const n = active();
    sum.textContent = n ? `Filters (${n})` : "Filters";
    clear.hidden = !n;
    saveUrl();
  };
  const redraw = () => {
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(draw);
    else draw();
  };
  const selects: Record<string, HTMLSelectElement> = {};
  const mk = (key: "sort" | "lang" | "status" | "topic", label: string, opts: [string, string][]) => {
    const l = pick(label, opts, view[key], (v) => { (view as Record<string, string>)[key] = v; redraw(); });
    selects[key] = l.querySelector("select")!;
    return l;
  };
  function setTopic(t: string) {
    view.topic = view.topic === t ? "" : t;
    selects.topic.value = view.topic;
    redraw();
  }
  add(fbody,
    mk("sort", "Sort", [["active", "Recently active"], ["stars", "Stars"], ["name", "Name"], ["status", "Status"]]),
    mk("lang", "Language", [["", "All"], ...langs.map((l): [string, string] => [l, l])]),
    mk("status", "Status", [["all", "All"], ["up", "Up"], ["down", "Down"]]),
    mk("topic", "Topic", [["", "All"], ...topics.map((t): [string, string] => [t, t])]));
  clear.addEventListener("click", () => {
    Object.assign(view, DEFAULT_VIEW);
    search.value = "";
    for (const [k, s] of Object.entries(selects)) s.value = (view as Record<string, string>)[k];
    redraw();
  });
  search.addEventListener("input", () => { view.q = search.value; draw(); });
  filters.open = Boolean(view.lang || view.topic || view.status !== "all" || view.sort !== "active");
  add(filters, sum, fbody);
  add(bar, sl, filters, clear);
  const spot = spotlight(ps, commits);
  if (spot) add(wrap, spot);
  add(wrap, bar, count, grid);
  draw();
  return wrap;
}

/** main.ts passes both fetches; no internal fetching here. */
let held: [Res<Project[]>, Res<Commit[]>] | null = null;
document.addEventListener("focusout", () => setTimeout(() => {
  if (held && !document.getElementById("projects")?.contains(document.activeElement)) renderProjects(...held);
}));
export function renderProjects(projects: Res<Project[]>, commits: Res<Commit[]>) {
  const cs = commits.state === "ok" ? commits.data : [];
  if (projects.state === "ok") {
    cur = { ps: projects.data, commits: cs };
    setPaletteProjects(projects.data);
  }
  const sec = document.getElementById("projects")!;
  if (sec.contains(document.activeElement) && sec.querySelector(":scope > .body:not(.skel)")) { held = [projects, commits]; return; } // don't yank the search box mid-typing
  held = null;
  show("projects", projects, (ps) => hub(ps, cs));
  if (projects.state === "ok") syncDialog();
}
