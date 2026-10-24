import * as d3 from "d3";
import "./charts.css";
import { add, el, show, type Heat, type Res, type Stats } from "./api";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Day = Heat["days"][number];
const fmtDay = (date: string) =>
  new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Last `weeks` week-columns (Sunday-aligned); everything when the data is shorter. */
export function windowDays(days: Day[], weeks: number): Day[] {
  if (!days.length) return days;
  const lastDow = new Date(days[days.length - 1].date + "T00:00:00Z").getUTCDay();
  return days.slice(Math.max(0, days.length - ((weeks - 1) * 7 + lastDow + 1)));
}

let redraw: (() => void) | null = null;
let mq: MediaQueryList | undefined;
const mobile = () => mq ??= matchMedia("(max-width: 639.98px)");
const listen = () => mobile().addEventListener("change", () => redraw?.(), { once: false });
let listening = false;

function grid(all: Day[]) {
  let full = false;
  const out = el("div");
  const toggle = el("button", "Full year", "hs-btn heat-toggle", { type: "button", "aria-pressed": "false" });
  const wrap = el("div", "", "heat-wrap", { tabindex: "0", role: "region", "aria-label": "Contribution heatmap, scrollable" });
  const readout = el("p", "", "readout", { "aria-live": "polite" });
  const summary = el("p", "", "muted");
  const legend = el("div", "", "heat-legend", { "aria-hidden": "true" });
  add(legend, "Less");
  for (let i = 0; i < 5; i++) add(legend, el("i", "", `l${i}`));
  add(legend, "More");

  const draw = () => {
    toggle.hidden = !mobile().matches;
    const days = mobile().matches && !full ? windowDays(all, 26) : all;
    const cell = 12, step = 14, top = 16;
    const first = new Date(days[0].date + "T00:00:00Z").getUTCDay();
    const weeks = Math.ceil((first + days.length) / 7);
    const total = d3.sum(days, (d) => d.count);
    const max = d3.max(days, (d) => d.count) ?? 0;
    const level = d3.scaleQuantize<number>([1, Math.max(2, max + 1)], [1, 2, 3, 4]);
    const w = weeks * step, h = 7 * step + top;
    const svg = d3.create("svg").attr("class", "heat").attr("viewBox", `0 0 ${w} ${h}`)
      .style("min-width", `${w}px`).attr("role", "group").attr("aria-label", `Daily contributions, ${days.length} days`);
    let prev = "";
    days.forEach((d, i) => {
      const m = d.date.slice(0, 7);
      if (m === prev) return;
      prev = m;
      const x = Math.floor((first + i) / 7) * step;
      if (x + 28 <= w) svg.append("text").attr("class", "months").attr("x", x).attr("y", 11).attr("aria-hidden", "true")
        .text(new Date(d.date + "T00:00:00Z").toLocaleString("en", { month: "short", timeZone: "UTC" }));
    });
    const cells = svg.selectAll("rect").data(days).join("rect")
      .attr("class", (d) => `l${d.count ? level(d.count) : 0}`)
      .attr("x", (_, i) => Math.floor((first + i) / 7) * step)
      .attr("y", (_, i) => ((first + i) % 7) * step + top)
      .attr("width", cell).attr("height", cell)
      .attr("role", "button").attr("tabindex", (_, i) => (i === days.length - 1 ? 0 : -1))
      .attr("aria-label", (d) => `${plural(d.count, "contribution")}, ${fmtDay(d.date)}`);
    const nodes = cells.nodes() as unknown as SVGElement[];
    const say = (i: number) => { readout.textContent = `${plural(days[i].count, "contribution")} · ${fmtDay(days[i].date)}`; };
    const idx = (e: Event) => nodes.indexOf(e.currentTarget as SVGElement);
    cells.on("focus", (e) => say(idx(e))).on("click", (e) => say(idx(e))).on("pointerenter", (e) => say(idx(e)))
      .on("keydown", (e: KeyboardEvent) => {
        const k: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
        if (!(e.key in k)) return;
        e.preventDefault();
        const n = idx(e) + k[e.key];
        if (n < 0 || n >= nodes.length) return;
        nodes[idx(e)].setAttribute("tabindex", "-1");
        nodes[n].setAttribute("tabindex", "0");
        nodes[n].focus();
      });
    wrap.replaceChildren(svg.node() as unknown as SVGElement);
    summary.textContent = `${plural(total, "contribution")} in the last ${days.length} days.`;
    readout.textContent = "Tap or focus a day for details.";
    wrap.scrollLeft = wrap.scrollWidth; // start at the most recent week
    fade();
  };
  // Edge fade only on the side(s) with more content, so a scrollable year view is visibly scrollable.
  const fade = () => {
    wrap.toggleAttribute("data-fade-l", wrap.scrollLeft > 1);
    wrap.toggleAttribute("data-fade-r", wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 1);
  };
  wrap.addEventListener("scroll", fade, { passive: true });
  toggle.addEventListener("click", () => {
    full = !full;
    toggle.setAttribute("aria-pressed", String(full));
    toggle.textContent = full ? "Last 26 weeks" : "Full year";
    draw();
  });
  redraw = draw;
  if (!listening) { listening = true; listen(); }
  add(out, toggle, wrap, readout, legend, summary);
  draw();
  requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; fade(); }); // layout isn't final until attached
  return out;
}

function statRow(s: Stats) {
  const dl = el("dl", "", "stats");
  const items: [string, string][] = [
    ["Current streak", plural(s.streak.current, "day")], ["Longest streak", plural(s.streak.longest, "day")],
    ["Busiest weekday", s.busiestWeekday ?? "-"], ["Contributions this year", s.contributionsThisYear.toLocaleString("en")],
  ];
  for (const [k, v] of items) {
    const d = el("div");
    add(d, el("dt", k), el("dd", v));
    add(dl, d);
  }
  return dl;
}

function weekdays(t: number[]) {
  const max = d3.max(t) ?? 0;
  if (t.length !== 7 || !max) return el("div");
  const bw = 30, gap = 12, h = 64, w = 7 * (bw + gap); // each group's hit area is the full bw+gap tile (>=44px at 390)
  const y = d3.scaleLinear([0, max], [0, h]);
  const out = el("div");
  const readout = el("p", "Tap or focus a bar for details.", "readout", { "aria-live": "polite" });
  const svg = d3.create("svg").attr("class", "wk").attr("viewBox", `0 0 ${w} ${h + 16}`)
    .attr("role", "group").attr("aria-label", "Commits by weekday");
  const g = svg.selectAll("g").data(t).join("g").attr("transform", (_, i) => `translate(${i * (bw + gap) + gap / 2},0)`)
    .attr("role", "button").attr("tabindex", 0).attr("aria-label", (n, i) => `${WD[i]}: ${plural(n, "commit")}`);
  g.append("rect").attr("class", "hit").attr("x", -gap / 2).attr("width", bw + gap).attr("height", h + 16).attr("fill", "transparent");
  g.append("rect").attr("class", "bar").attr("width", bw).attr("y", (n) => h - y(n)).attr("height", (n) => y(n));
  g.append("text").attr("x", bw / 2).attr("y", h + 13).attr("aria-hidden", "true").text((_, i) => WD[i]);
  const nodes = g.nodes() as unknown as SVGElement[];
  const say = (e: Event) => {
    const i = nodes.indexOf(e.currentTarget as SVGElement);
    readout.textContent = `${WD[i]}: ${plural(t[i], "commit")}`;
  };
  g.on("focus", say).on("click", say).on("pointerenter", say);
  add(out, svg.node() as unknown as SVGElement, readout);
  return out;
}

export function renderHeatmap(heat: Res<Heat>, stats: Res<Stats>) {
  show("heatmap", heat, (h) => {
    const out = el("div");
    add(out, grid(h.days));
    if (stats.state === "ok") add(out, statRow(stats.data), weekdays(stats.data.weekdayTotals));
    return out;
  });
}
