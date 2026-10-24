import * as d3 from "d3";
import { add, el, fmtDate, link, NODATA, type Commit, type Project } from "./api";
import { commitsFor, firstLine, plural, relTime, safeColor } from "./hubutil";
import { toHash } from "./urlstate";

let dlg: HTMLDialogElement | null = null;
let current = "";

const wkLabel = (sec: number) => new Date(sec * 1000).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

function freqChart(p: Project) {
  const w = 520, h = 190, m = 6, data = p.codeFreq, axis = 28;
  const max = d3.max(data, (d) => Math.max(d.add, d.del)) || 1;
  const x = d3.scaleBand<number>(data.map((_, i) => i), [m, w - m]).padding(0.2);
  const mid = (h - axis) / 2;
  const y = d3.scaleLinear([0, max], [0, mid - m]);
  const wrap = el("div", "", "hub-chartwrap");
  const out = el("p", "Tap or focus a week for its numbers.", "hub-readout muted", { role: "status" });
  const svg = d3.create("svg").attr("class", "hub-chart").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "group")
    .attr("aria-label", `Weekly lines added and deleted, last ${data.length} weeks. Arrow keys move between weeks.`);
  svg.append("line").attr("x1", m).attr("x2", w - m).attr("y1", mid).attr("y2", mid).attr("stroke", "var(--border-strong)");
  const cols = svg.selectAll("g.wk").data(data).join("g").attr("class", "wk-col")
    .attr("tabindex", (_, i) => (i === 0 ? 0 : -1)).attr("role", "img")
    .attr("aria-label", (d) => `Week of ${wkLabel(d.week)}: ${d.add} added, ${d.del} deleted`);
  cols.append("rect").attr("class", "hit").attr("fill", "transparent").attr("x", (_, i) => x(i)! - 1).attr("width", x.bandwidth() + 2).attr("y", 0).attr("height", h - axis);
  cols.append("rect").attr("class", "add").attr("fill", "var(--accent)").attr("x", (_, i) => x(i)!).attr("width", x.bandwidth())
    .attr("y", (d) => mid - y(d.add)).attr("height", (d) => y(d.add));
  cols.append("rect").attr("class", "del").attr("fill", "var(--fx-2)").attr("x", (_, i) => x(i)!).attr("width", x.bandwidth())
    .attr("y", mid).attr("height", (d) => y(d.del));
  const step = Math.max(1, Math.ceil(data.length / 5));
  svg.selectAll("text.ax").data(data.map((d, i) => ({ d, i })).filter((o) => o.i % step === 0)).join("text").attr("class", "hub-ax")
    .attr("x", (o) => x(o.i)! + x.bandwidth() / 2).attr("y", h - 6).attr("text-anchor", "middle").text((o) => wkLabel(o.d.week));
  const node = svg.node() as unknown as SVGSVGElement;
  const show = (i: number) => {
    const d = data[i];
    out.textContent = `Week of ${wkLabel(d.week)}: +${d.add.toLocaleString("en")} added, -${d.del.toLocaleString("en")} deleted`;
  };
  const colEls = [...node.querySelectorAll<SVGGElement>("g.wk-col")];
  colEls.forEach((g, i) => {
    g.addEventListener("focus", () => show(i));
    g.addEventListener("click", () => show(i));
    g.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(i); });
    g.addEventListener("keydown", (e) => {
      const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? colEls.length - 1 : -1;
      if (n < 0 || n >= colEls.length) return;
      e.preventDefault();
      colEls[i].setAttribute("tabindex", "-1");
      colEls[n].setAttribute("tabindex", "0");
      colEls[n].focus();
    });
  });
  add(wrap, node, out);
  return wrap;
}

function copyRow(label: string, text: string) {
  const row = el("div", "", "hub-copy");
  const note = el("span", "", "muted hub-note", { role: "status", "aria-live": "polite" });
  const btn = el("button", "Copy", "hs-btn hub-btn", { type: "button", "aria-label": `Copy ${label} snippet` });
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      note.textContent = "Copied";
    } catch {
      note.textContent = "Copy failed, select the text instead";
    }
  });
  const r = el("div", "", "hub-row");
  add(r, btn, note);
  add(row, el("code", text, "hub-snippet"), r);
  return row;
}

function timeline(p: Project) {
  const ev: [string, string, string][] = [];
  if (p.createdAt) ev.push([p.createdAt, "Created", ""]);
  if (p.release?.at) ev.push([p.release.at, "Latest release", p.release.tag]);
  if (p.pushedAt) ev.push([p.pushedAt, "Last push", ""]);
  ev.sort((a, b) => a[0].localeCompare(b[0]));
  const ol = el("ol", "", "hub-tl");
  for (const [at, what, extra] of ev) add(ol, el("li", `${what}${extra ? ` ${extra}` : ""}: ${fmtDate(at)} (${relTime(at)})`));
  add(ol, el("li", `Now: ${fmtDate(new Date().toISOString())}`));
  return ol;
}

function build(p: Project, commits: Commit[]) {
  const d = el("dialog", "", "hub-dialog hs-card", { "aria-labelledby": "hub-dlg-title" });
  const head = el("div", "", "hub-dialog__head");
  add(head, el("h2", p.name, "", { id: "hub-dlg-title" }));
  const close = el("button", "Close", "hs-btn hub-btn", { type: "button" });
  close.addEventListener("click", () => d.close());
  add(head, close);
  add(d, head);

  const acts = el("div", "", "hub-actions");
  if (p.url) add(acts, link("Live", p.url, "hs-btn hub-btn hub-btn--alt"));
  add(acts, link("Repo", `https://github.com/${p.repo}`, "hs-btn hub-btn hub-btn--alt"));
  add(d, acts);
  if (p.release) add(d, el("p", `Latest release ${p.release.tag}${p.release.at ? `, ${fmtDate(p.release.at)}` : ""}`, "hub-meta"));
  if (p.commitCount != null) add(d, el("p", plural(p.commitCount, "commit"), "hub-meta"));

  add(d, el("h3", "Timeline"), timeline(p));

  add(d, el("h3", "Lighthouse"));
  if (p.lighthouse) {
    const lh = p.lighthouse;
    const ul = el("ul", "", "hub-langs");
    for (const [k, n] of [["Perf", lh.performance], ["A11y", lh.accessibility], ["Best", lh.best_practices], ["SEO", lh.seo]] as const) add(ul, el("li", `${k} ${n}`));
    add(d, ul, el("p", `Week ${lh.week}`, "muted"));
  } else add(d, el("p", NODATA, "muted"));

  if (p.deps?.length) {
    add(d, el("h3", "Dependencies"));
    const ul = el("ul", "", "hub-langs");
    for (const x of p.deps) { const li = el("li"); add(li, link(`${x.name}: ${x.indicator}`, x.url)); add(ul, li); }
    add(d, ul);
  }

  add(d, el("h3", "Lines changed, last 26 weeks"));
  if (p.codeFreq?.length) {
    add(d, freqChart(p));
    const k = el("p", "", "muted");
    add(k, el("span", "added", "hub-key"), el("span", "deleted", "hub-key hub-key--del"));
    add(d, k);
  } else add(d, el("p", NODATA, "muted"));

  add(d, el("h3", "Languages"));
  if (p.languages?.length) {
    const ul = el("ul", "", "hub-langs");
    for (const l of p.languages) {
      const li = el("li");
      const dot = el("i", "", "hub-dot", { "aria-hidden": "true" });
      dot.style.background = safeColor(l.color);
      add(li, dot, `${l.lang} ${l.pct.toFixed(1)}%`);
      add(ul, li);
    }
    add(d, ul);
  } else add(d, el("p", NODATA, "muted"));

  add(d, el("h3", "Recent commits"));
  const cs = commitsFor(p, commits).slice(0, 8);
  if (cs.length) {
    const ul = el("ul", "", "list");
    for (const c of cs) {
      const li = el("li");
      add(li, link(firstLine(c.message), c.url), el("span", ` ${relTime(c.ts) || fmtDate(c.ts)}`, "muted"));
      add(ul, li);
    }
    add(d, ul);
  } else add(d, el("p", NODATA, "muted"));

  const n = encodeURIComponent(p.name);
  add(d, el("h3", "Status badge"), copyRow("badge", `![status](${location.origin}/badge/${n}.svg)`));
  add(d, el("h3", "Project card"), copyRow("card", `![card](${location.origin}/card/${n}.svg)`));

  d.addEventListener("close", () => {
    d.remove();
    if (dlg === d) { dlg = null; current = ""; }
    if (d.dataset.quiet) return;
    if (history.state?.hubDlg) history.back(); // we pushed the entry: pop it
    else if (location.hash.startsWith("#p/")) history.replaceState(null, "", location.pathname + location.search);
  });
  return d;
}

/** Name of the project whose dialog is open, or "". */
export const openName = () => current;

/** Close without touching history (used when history already moved). */
export function closeDetail() {
  if (!dlg) return;
  dlg.dataset.quiet = "1"; // close event is async, so flag the element, not a global
  dlg.close();
  dlg.remove();
  dlg = null;
  current = "";
}

/** Open the detail dialog; pushes one #p/<name> history entry (none if the hash already matches). Focus returns to the opener on close. */
export function openDetail(p: Project, commits: Commit[]) {
  if (dlg && current === p.name) return;
  closeDetail();
  const hash = toHash(p.name);
  if (location.hash !== hash) history.pushState({ hubDlg: 1 }, "", location.pathname + location.search + hash);
  dlg = build(p, commits);
  current = p.name;
  document.body.appendChild(dlg);
  dlg.showModal();
}
