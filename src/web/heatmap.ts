import * as d3 from "d3";
import { add, el, fmtDate, link, show, type Commit, type Heat, type Res, type Stats } from "./api";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function heat(days: Heat["days"], stats: Res<Stats>) {
  const cell = 11, step = 14;
  const first = new Date(days[0].date + "T00:00:00Z").getUTCDay();
  const weeks = Math.ceil((first + days.length) / 7);
  const total = d3.sum(days, (d) => d.count);
  const max = d3.max(days, (d) => d.count) ?? 0;
  const level = d3.scaleQuantize<number>([1, Math.max(2, max + 1)], [1, 2, 3, 4]);
  const top = 14, w = weeks * step, h = 7 * step + top;
  const svg = d3.create("svg").attr("class", "heat").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h)
    .attr("role", "img").attr("aria-label", `${total} commits over the last ${days.length} days, busiest day ${max}`);
  let prev = "";
  days.forEach((d, i) => {
    const m = d.date.slice(0, 7);
    if (m === prev) return;
    prev = m;
    const x = Math.floor((first + i) / 7) * step;
    if (x + 24 <= w) svg.append("text").attr("class", "months").attr("x", x).attr("y", 9).attr("aria-hidden", "true")
      .text(new Date(d.date + "T00:00:00Z").toLocaleString("en", { month: "short", timeZone: "UTC" }));
  });
  svg.selectAll("rect").data(days).join("rect")
    .attr("class", (d) => `l${d.count ? level(d.count) : 0}`)
    .attr("x", (_, i) => Math.floor((first + i) / 7) * step)
    .attr("y", (_, i) => ((first + i) % 7) * step + top)
    .attr("width", cell).attr("height", cell)
    .append("title").text((d) => `${d.date}: ${d.count} commit${d.count === 1 ? "" : "s"}`);
  const wrap = el("div", "", "heat-wrap", { tabindex: "0", role: "region", "aria-label": "Commit heatmap, scrollable" });
  add(wrap, svg.node() as unknown as SVGElement);
  const out = el("div");
  add(out, wrap, el("p", `${total} commits in the last ${days.length} days.`, "muted"));
  if (stats.state === "ok") add(out, statRow(stats.data), weekdays(stats.data.weekdayTotals));
  return out;
}

function statRow(s: Stats) {
  const dl = el("dl", "", "stats");
  const items: [string, string][] = [
    ["Current streak", `${s.streak.current} days`], ["Longest streak", `${s.streak.longest} days`],
    ["Busiest weekday", s.busiestWeekday ?? "-"], ["This year", `${s.contributionsThisYear} contributions`],
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
  const bw = 28, gap = 8, h = 60, w = 7 * (bw + gap) - gap;
  const y = d3.scaleLinear([0, max], [0, h]);
  const svg = d3.create("svg").attr("class", "wk").attr("viewBox", `0 0 ${w} ${h + 14}`).attr("width", w).attr("height", h + 14)
    .attr("role", "img").attr("aria-label", "Commits by weekday: " + t.map((n, i) => `${WD[i]} ${n}`).join(", "));
  const g = svg.selectAll("g").data(t).join("g").attr("transform", (_, i) => `translate(${i * (bw + gap)},0)`);
  g.append("rect").attr("width", bw).attr("y", (n) => h - y(n)).attr("height", (n) => y(n))
    .append("title").text((n, i) => `${WD[i]}: ${n} commit${n === 1 ? "" : "s"}`);
  g.append("text").attr("x", bw / 2).attr("y", h + 11).attr("aria-hidden", "true").text((_, i) => WD[i]);
  return svg.node() as unknown as SVGElement;
}

export function renderHeatmap(res: Res<Heat>, stats: Res<Stats>) {
  show("heatmap", res, (h) => heat(h.days, stats));
}

export function renderCommits(res: Res<Commit[]>) {
  show("commits", res, (cs) => {
    const ul = el("ul", "", "list");
    for (const c of cs.slice(0, 10)) {
      const li = el("li");
      add(li, link(c.message.split("\n")[0], c.url), el("span", ` ${c.repo} · ${c.author} · ${fmtDate(c.ts)}`, "muted"));
      add(ul, li);
    }
    return ul;
  });
}
