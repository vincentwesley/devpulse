import * as d3 from "d3";
import { add, el, fmtDate, link, NODATA, type Commit, type Project } from "./api";
import { commitsFor, firstLine, relTime, safeColor } from "./hubutil";

const BADGE = "https://devpulse.vincentwesleybiz.workers.dev/badge";
let dlg: HTMLDialogElement | null = null;

function freqChart(p: Project) {
  const w = 520, h = 150, m = 6, data = p.codeFreq;
  const max = d3.max(data, (d) => Math.max(d.add, d.del)) || 1;
  const x = d3.scaleBand<number>(data.map((_, i) => i), [m, w - m]).padding(0.2);
  const mid = h / 2;
  const y = d3.scaleLinear([0, max], [0, mid - m]);
  const svg = d3.create("svg").attr("class", "hub-chart").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img")
    .attr("aria-label", `Weekly lines added and deleted, last ${data.length} weeks`);
  svg.append("line").attr("x1", m).attr("x2", w - m).attr("y1", mid).attr("y2", mid).attr("stroke", "var(--border-strong)");
  svg.selectAll("rect.add").data(data).join("rect").attr("class", "add").attr("fill", "var(--accent)")
    .attr("x", (_, i) => x(i)!).attr("width", x.bandwidth()).attr("y", (d) => mid - y(d.add)).attr("height", (d) => y(d.add));
  svg.selectAll("rect.del").data(data).join("rect").attr("class", "del").attr("fill", "var(--fx-2)")
    .attr("x", (_, i) => x(i)!).attr("width", x.bandwidth()).attr("y", mid).attr("height", (d) => y(d.del));
  return svg.node() as unknown as SVGElement;
}

function build(p: Project, commits: Commit[]) {
  const d = el("dialog", "", "hub-dialog hs-card", { "aria-labelledby": "hub-dlg-title" });
  const head = el("div", "", "hub-dialog__head");
  add(head, el("h2", p.name, "", { id: "hub-dlg-title" }));
  const close = el("button", "Close", "hs-btn hub-btn", { type: "button" });
  close.addEventListener("click", () => d.close());
  add(head, close);
  add(d, head);

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

  add(d, el("h3", "Status badge"));
  const snippet = `![status](${BADGE}/${encodeURIComponent(p.name)}.svg)`;
  const code = el("code", snippet, "hub-snippet");
  const note = el("span", "", "muted", { role: "status" });
  const copy = el("button", "Copy", "hs-btn hub-btn", { type: "button" });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      note.textContent = "Copied";
    } catch {
      note.textContent = "Copy failed, select the text instead";
    }
  });
  add(d, code, el("div", "", "hub-row"));
  add(d.lastElementChild!, copy, note);
  d.addEventListener("close", () => d.remove());
  return d;
}

/** Open the detail dialog for a project; focus returns to the opener on close (native showModal). */
export function openDetail(p: Project, commits: Commit[]) {
  dlg?.remove();
  dlg = build(p, commits);
  document.body.appendChild(dlg);
  dlg.showModal();
}
