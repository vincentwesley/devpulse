import * as d3 from "d3";
import "./ledger.css";
import { add, el, fmtDate, NODATA, show, type Commit, type Project, type Res, type Status } from "./api";
import { openDetail, wide } from "./detail";
import { icon } from "./icons";
import { ciOf, dayClass, fmtPct, openIncidentRepos, plural, relTime, rowState, safeColor, siteFor, sortFilter, STATE_TEXT, type Sort, type StatusFilter } from "./hubutil";
import { setPaletteProjects } from "./palette";
import { lastBars, windowPct } from "./status";
import { DEFAULT_VIEW, parseProjectPath, parseUrl, toProjectPath, toSearch } from "./urlstate";

// Toolbar state, seeded from the URL, survives the periodic re-render.
const { p: _p, ...seed } = parseUrl(location.search, "");
const view: typeof DEFAULT_VIEW = seed;
const saveUrl = () => parseProjectPath(location.pathname) === null && history.replaceState(history.state, "", location.pathname + toSearch(view) + location.hash);

/** Sparkline of weekly churn; role=img so the cell has a text alternative. */
function spark(vals: number[], label: string) {
  const w = 120, h = 24;
  const [lo, hi] = d3.extent(vals) as [number, number];
  const svg = d3.create("svg").attr("class", "lg-spark").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img").attr("aria-label", label);
  const x = d3.scaleLinear([0, Math.max(1, vals.length - 1)], [2, w - 2]);
  const y = d3.scaleLinear([0, hi || 1], [h - 3, 3]);
  svg.append("path").attr("fill", "none").attr("stroke", "currentColor").attr("stroke-width", 1.5)
    .attr("d", d3.line<number>().x((_, i) => x(i)).y((v) => (lo === hi ? h / 2 : y(v)))(vals));
  return svg.node() as unknown as SVGElement;
}

/** Last-30-days uptime: tiny day cells + the percentage. Null without a live site / data. */
function uptimeCell(p: Project, st: Status | null) {
  const s = siteFor(p, st);
  const bars = s ? lastBars(s.days, 30) : [];
  const pct = s ? windowPct(bars) : null;
  if (!bars.length || pct === null) return null;
  const box = el("span", "", "lg-up");
  const strip = el("span", "", "up-bar", { role: "img", "aria-label": `Uptime, last ${bars.length} days: ${fmtPct(pct)}` });
  for (const d of bars) add(strip, el("i", "", "", { "data-c": dayClass(d).cls }));
  add(box, strip, el("span", fmtPct(pct), "lg-pct"));
  return box;
}

const dash = () => { const f = document.createDocumentFragment(); add(f, el("span", "—", "meta", { "aria-hidden": "true" }), el("span", "no data", "sr-only")); return f; };

interface Col { key: Sort | null; label: string; cls: string }
const COLS: Col[] = [
  { key: "status", label: "Status", cls: "c-st" },
  { key: "name", label: "Project", cls: "c-name" },
  { key: "lang", label: "Language", cls: "c-lang" },
  { key: null, label: "Activity", cls: "c-spark" },
  { key: "ci", label: "CI", cls: "c-ci" },
  { key: "active", label: "Last push", cls: "c-push" },
  { key: "uptime", label: "Uptime 30d", cls: "c-up" },
];
const sortAria = (k: Sort): "ascending" | "descending" => (k === "active" ? "descending" : "ascending");

function row(p: Project, st: Status | null, bad: Set<string>) {
  const tr = el("tr", "", "proj", { role: "row" });
  const td = (cls: string, ...kids: (Node | string)[]) => { const c = el("td", "", cls, { role: "cell" }); add(c, ...kids); add(tr, c); return c; };
  const rs = rowState(p, bad);
  td("c-st", el("span", "", "dp-status", { "data-s": rs }), el("span", STATE_TEXT[rs], "sr-only"));

  const a = el("a", p.name, "lg-name", { href: toProjectPath(p.name) });
  a.dataset.vp = p.name;
  const blurb = p.tagline ?? p.description;
  td("c-name", a, ...(blurb ? [el("span", blurb, "lg-tag")] : []));

  const lc = p.languages?.find((l) => l.lang === p.language)?.color;
  if (p.language) {
    const dot = el("i", "", "lg-dot", { "aria-hidden": "true" });
    dot.style.background = safeColor(lc);
    td("c-lang", dot, el("span", p.language, "meta"));
  } else td("c-lang", dash());

  const freq = p.codeFreq ?? [];
  td("c-spark", freq.length ? spark(freq.map((w) => w.add + w.del), `Lines changed per week, last ${freq.length} weeks`) : dash());

  const ci = ciOf(p);
  td("c-ci", ci ? el("span", ci.label, `hs-chip ci ci--${ci.cls}`) : dash());

  td("c-push", p.pushedAt ? el("span", relTime(p.pushedAt), "meta", { title: fmtDate(p.pushedAt) }) : dash());

  const up = uptimeCell(p, st);
  td("c-up", up ?? (p.url ? el("span", NODATA, "meta") : dash()));
  return tr;
}

let cur: { ps: Project[]; status: Status | null } = { ps: [], status: null };
let selected: string | null = null;
let draw: (() => void) | null = null; // redraw the ledger shell, once built

const links = () => [...document.querySelectorAll<HTMLAnchorElement>("#ledger a.lg-name")];

/** Mark the open project's row (pane open on desktop); scroll it into view when asked. */
export function markSelected(name: string | null, scroll = false) {
  selected = name;
  for (const a of links()) {
    const on = a.dataset.vp === name;
    if (on) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
    a.closest("tr")!.toggleAttribute("data-sel", on);
    if (on && scroll) a.scrollIntoView({ block: "nearest" });
  }
}
export const topicNow = () => view.topic;
/** Toggle a topic filter from the detail pane; returns the active topic. */
export function toggleTopic(t: string) {
  view.topic = view.topic === t ? "" : t;
  draw?.();
  return view.topic;
}
/** Filter the list by one topic; returns the new "?..." search string. */
export function showTopic(t: string) {
  view.topic = t;
  draw?.();
  return toSearch(view);
}

function build(ps: Project[]) {
  const wrap = el("div", "", "lg");
  const bar = el("div", "", "lg-bar", { role: "group", "aria-label": "Project controls" });
  const search = el("input", "", "lg-q", { type: "search", id: "hub-q", name: "q", placeholder: "Search projects", autocomplete: "off", maxlength: "100", "aria-label": "Search projects" });
  search.value = view.q;
  const sw = el("div", "", "lg-search");
  add(sw, icon("search", 16), search);

  const chips = el("div", "", "lg-chips", { role: "group", "aria-label": "Show" });
  const CHIPS: [StatusFilter, string][] = [["all", "All"], ["live", "Live"], ["failing", "Failing"], ["wip", "WIP"]];
  const chipEls = new Map<StatusFilter, { b: HTMLButtonElement; n: HTMLElement }>();
  for (const [k, label] of CHIPS) {
    const b = el("button", "", "lg-chip", { type: "button", "aria-pressed": "false" });
    const n = el("span", "", "lg-n");
    add(b, label, " ", n);
    b.addEventListener("click", () => { view.status = k; paint(); });
    chipEls.set(k, { b, n });
    add(chips, b);
  }

  const lsel = el("select", "", "lg-lang", { "aria-label": "Language", name: "lang" });
  const topicBtn = el("button", "", "lg-chip lg-topic", { type: "button" });
  const clear = el("button", "Clear filters", "lg-clear", { type: "button" });
  const count = el("p", "", "meta lg-count", { role: "status" });
  add(bar, sw, chips, lsel, topicBtn, clear, count);

  const table = el("table", "", "lg-table", { role: "table" });
  add(table, el("caption", "Projects: status, activity, CI and uptime. Column headers sort the list.", "sr-only"));
  const thead = el("thead", "", "", { role: "rowgroup" });
  const hr = el("tr", "", "", { role: "row" });
  const ths = new Map<Sort, HTMLElement>();
  for (const c of COLS) {
    const th = el("th", "", c.cls, { role: "columnheader", scope: "col" });
    if (c.key) {
      const k = c.key;
      const b = el("button", "", "lg-sort", { type: "button" });
      add(b, el("span", c.label), icon("sort", 12));
      b.addEventListener("click", () => { view.sort = view.sort === k ? "active" : k; paint(); });
      add(th, b);
      ths.set(k, th);
    } else add(th, c.label);
    add(hr, th);
  }
  add(thead, hr);
  const tbody = el("tbody", "", "", { role: "rowgroup" });
  add(table, thead, tbody);
  add(wrap, bar, table);

  const open = (e: MouseEvent, name: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openDetail(name);
    if (e.detail === 0 && wide()) document.querySelector<HTMLElement>("#detail-pane .dt-title")?.focus(); // keyboard: move into the pane
  };
  tbody.addEventListener("click", (e) => {
    const t = e.target as Element;
    const tr = t.closest<HTMLElement>("tr.proj");
    if (!tr?.dataset.name) return;
    if (t.closest("a, button") && !t.closest("a.lg-name")) return;
    open(e, tr.dataset.name);
  });

  const active = () => Boolean(view.q || view.lang || view.topic || view.status !== "all" || view.sort !== "active");
  const syncLangs = () => {
    const langs = [...new Set(cur.ps.map((p) => p.language).filter(Boolean) as string[])].sort();
    if (view.lang && !langs.includes(view.lang)) langs.push(view.lang);
    lsel.replaceChildren(el("option", "All languages", "", { value: "" }), ...langs.map((l) => el("option", l, "", { value: l })));
    lsel.value = view.lang;
  };
  function paint() {
    const { ps: all, status } = cur;
    const bad = openIncidentRepos(status);
    const list = sortFilter(all, view.sort, view.lang, view.status, view.q, view.topic, bad);
    const focused = document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("lg-name") ? document.activeElement.dataset.vp : null;
    tbody.replaceChildren();
    for (const p of list) {
      const tr = row(p, status, bad);
      tr.dataset.name = p.name;
      add(tbody, tr);
    }
    if (!list.length) {
      const tr = el("tr", "", "", { role: "row" });
      const c = el("td", "no projects match", "lg-none", { colspan: String(COLS.length), role: "cell" });
      add(tr, c);
      add(tbody, tr);
    }
    if (selected) markSelected(selected);
    if (focused) links().find((a) => a.dataset.vp === focused)?.focus();
    for (const [k, th] of ths) th.setAttribute("aria-sort", view.sort === k ? sortAria(k) : "none");
    for (const [k, { b, n }] of chipEls) {
      b.setAttribute("aria-pressed", String(view.status === k));
      n.textContent = String(sortFilter(all, "active", view.lang, k, view.q, view.topic, bad).length);
    }
    topicBtn.hidden = !view.topic;
    topicBtn.textContent = `Topic: ${view.topic} ✕`;
    topicBtn.setAttribute("aria-label", `Clear topic filter ${view.topic}`);
    clear.hidden = !active();
    count.textContent = `${list.length} of ${plural(all.length, "project")}`;
    saveUrl();
  }
  const redraw = () => {
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(paint);
    else paint();
  };
  search.addEventListener("input", () => { view.q = search.value; paint(); });
  lsel.addEventListener("change", () => { view.lang = lsel.value; redraw(); });
  topicBtn.addEventListener("click", () => { view.topic = ""; syncPressed(); redraw(); });
  clear.addEventListener("click", () => {
    Object.assign(view, DEFAULT_VIEW);
    search.value = "";
    lsel.value = "";
    syncPressed();
    redraw();
  });
  const syncPressed = () => document.querySelectorAll<HTMLElement>(".dt .hub-topic").forEach((b) => b.setAttribute("aria-pressed", "false"));

  syncLangs();
  paint();
  draw = () => { syncLangs(); search.value = view.q; paint(); };
  return wrap;
}

// j / k move between rows, f searches. Plain keys, skipped while typing or when any dialog is open.
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || document.body.dataset.view || document.querySelector("dialog[open]")) return;
  if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
  if (e.key === "f") {
    const q = document.getElementById("hub-q");
    if (!q) return;
    e.preventDefault();
    q.focus();
    return;
  }
  if (e.key !== "j" && e.key !== "k") return;
  const ls = links();
  if (!ls.length) return;
  e.preventDefault();
  const i = ls.indexOf(document.activeElement as HTMLAnchorElement);
  const from = i >= 0 ? i : ls.findIndex((a) => a.dataset.vp === selected);
  ls[from < 0 ? 0 : Math.min(ls.length - 1, Math.max(0, from + (e.key === "j" ? 1 : -1)))].focus();
});

/** main.ts passes all three fetches; no internal fetching here. The toolbar is built once, rows redraw in place. */
export function renderProjects(projects: Res<Project[]>, _commits: Res<Commit[]>, status: Res<Status>) {
  if (projects.state === "ok") {
    cur = { ps: projects.data, status: status.state === "ok" ? status.data : null };
    setPaletteProjects(projects.data);
  }
  if (projects.state === "ok" && draw && document.querySelector("#ledger > .body .lg-table")) { draw(); return; }
  if (projects.state !== "error") draw = null; // an error keeps the last good table (show() leaves it alone)
  show("ledger", projects, (ps) => build(ps));
}
