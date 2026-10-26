import { create, max as dmax, sum } from "d3";
import { linear, quantize } from "./scale";
import { add, el, type Heat, type Stats } from "./api";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Day = Heat["days"][number];
const fmtDay = (date: string) =>
  new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Last `weeks` week-columns (Sunday-aligned); everything when the data is shorter. */
export function windowDays(days: Day[], weeks: number): Day[] {
  if (!days.length) return days;
  const lastDow = new Date(days[days.length - 1].date + "T00:00:00Z").getUTCDay();
  return days.slice(Math.max(0, days.length - ((weeks - 1) * 7 + lastDow + 1)));
}

// Default view follows the viewport (26 weeks on phones, full year on desktop) until the visitor picks one.
let full: boolean | null = null;
let redraw: (() => void) | null = null;
let mq: MediaQueryList | undefined;
const phone = () => (mq ??= matchMedia("(max-width: 639.98px)"));
let listening = false;

function grid(all: Day[]) {
  const out = el("div", "", "ct__heat");
  const seg = el("div", "", "heat-seg", { role: "group", "aria-label": "Heatmap range" });
  const bWeeks = el("button", "26 weeks", "heat-toggle", { type: "button" });
  const bYear = el("button", "Full year", "heat-toggle", { type: "button" });
  add(seg, bWeeks, bYear);
  const wrap = el("div", "", "heat-wrap", { tabindex: "0", role: "region", "aria-label": "Contribution heatmap, scrollable" });
  const readout = el("p", "", "tile-readout", { "aria-live": "polite" });
  const legend = el("div", "", "heat-legend", { "aria-hidden": "true" });
  add(legend, "Less");
  for (let i = 0; i < 5; i++) add(legend, el("i", "", `l${i}`));
  add(legend, "More");
  const summary = el("p", "", "meta");
  const foot = el("div", "", "ct__foot");
  add(foot, legend, summary);

  const draw = () => {
    const year = full ?? !phone().matches;
    bYear.setAttribute("aria-pressed", String(year));
    bWeeks.setAttribute("aria-pressed", String(!year));
    const days = year ? all : windowDays(all, 26);
    const cell = 12, step = 14, top = 18;
    const first = new Date(days[0].date + "T00:00:00Z").getUTCDay();
    const weeks = Math.ceil((first + days.length) / 7);
    const total = sum(days, (d) => d.count);
    const max = dmax(days, (d) => d.count) ?? 0;
    const level = quantize([1, Math.max(2, max + 1)], [1, 2, 3, 4]);
    const w = weeks * step, h = 7 * step + top;
    const svg = create("svg").attr("class", "heat").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h)
      .attr("role", "group").attr("aria-label", `Daily contributions, ${days.length} days`);
    let prev = "";
    const marks: { x: number; d: Day }[] = [];
    days.forEach((d, i) => {
      const m = d.date.slice(0, 7);
      if (m === prev) return;
      prev = m;
      marks.push({ x: Math.floor((first + i) / 7) * step, d });
    });
    // A label needs ~28px; when two months start closer than that (a partial first month), the earlier one is dropped.
    marks.forEach(({ x, d }, i) => {
      if (x + 30 > w || (marks[i + 1] && marks[i + 1].x - x < 28)) return;
      svg.append("text").attr("class", "months").attr("x", x).attr("y", 12).attr("aria-hidden", "true")
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
    summary.textContent = `${total.toLocaleString("en")} in ${year ? "the last year" : "26 weeks"}`;
    readout.textContent = "Tap or focus a day for details.";
    wrap.scrollLeft = wrap.scrollWidth; // start at the most recent week
    fade();
  };
  // Edge fade only on the side(s) with more content, so a scrollable view is visibly scrollable.
  const fade = () => {
    wrap.toggleAttribute("data-fade-l", wrap.scrollLeft > 1);
    wrap.toggleAttribute("data-fade-r", wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 1);
  };
  wrap.addEventListener("scroll", fade, { passive: true });
  bWeeks.addEventListener("click", () => { full = false; draw(); });
  bYear.addEventListener("click", () => { full = true; draw(); });
  redraw = draw;
  if (!listening) { listening = true; phone().addEventListener("change", () => full === null && redraw?.()); }
  add(out, seg, wrap, readout, foot);
  draw();
  requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; fade(); }); // layout isn't final until attached
  return out;
}

function streaks(s: Stats) {
  const dl = el("dl", "", "ct__streaks");
  for (const [k, v] of [["Current streak", s.streak.current], ["Longest streak", s.streak.longest]] as const) {
    const d = el("div");
    add(d, el("dt", k), el("dd", plural(v, "day")));
    add(dl, d);
  }
  return dl;
}

function weekdays(t: number[]) {
  const max = dmax(t) ?? 0;
  if (t.length !== 7 || !max) return el("div");
  const bw = 32, gap = 12, h = 56, w = 7 * (bw + gap); // each column's hit area is the full bw+gap tile (44px)
  const y = linear([0, max], [0, h]);
  const out = el("div", "", "ct__wk");
  const readout = el("p", "Tap or focus a bar for details.", "tile-readout", { "aria-live": "polite" });
  const svg = create("svg").attr("class", "wk").attr("viewBox", `0 0 ${w} ${h + 18}`)
    .attr("role", "group").attr("aria-label", "Commits by weekday");
  const g = svg.selectAll("g").data(t).join("g").attr("class", "wk-col").attr("transform", (_, i) => `translate(${i * (bw + gap) + gap / 2},0)`)
    .attr("role", "button").attr("tabindex", 0).attr("aria-label", (n, i) => `${WD[i]}: ${plural(n, "commit")}`);
  g.append("rect").attr("class", "hit").attr("x", -gap / 2).attr("width", bw + gap).attr("height", h + 18).attr("fill", "transparent");
  g.append("rect").attr("class", "bar").attr("width", bw).attr("y", (n) => h - y(n)).attr("height", (n) => y(n));
  g.append("text").attr("x", bw / 2).attr("y", h + 14).attr("aria-hidden", "true").text((_, i) => WD[i]);
  const nodes = g.nodes() as unknown as SVGElement[];
  const say = (e: Event) => {
    const i = nodes.indexOf(e.currentTarget as SVGElement);
    readout.textContent = `${WD[i]}: ${plural(t[i], "commit")}`;
  };
  g.on("focus", say).on("click", say).on("pointerenter", say);
  add(out, svg.node() as unknown as SVGElement, readout);
  return out;
}

/** Contributions tile body: heat strip with toggle, then streaks and the weekday bars when stats are available. */
export function contribTile(h: Heat, stats: Stats | null) {
  const out = el("div", "", "ct");
  add(out, grid(h.days));
  if (stats) {
    const side = el("div", "", "ct__side");
    add(side, streaks(stats), weekdays(stats.weekdayTotals ?? []));
    add(out, side);
  }
  return out;
}
