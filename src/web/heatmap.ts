import * as d3 from "d3";
import { add, el, fmtDate, link, show, type Commit, type Heat, type Res } from "./api";

function heat(days: Heat["days"]) {
  const cell = 11, step = 14;
  const first = new Date(days[0].date + "T00:00:00Z").getUTCDay();
  const weeks = Math.ceil((first + days.length) / 7);
  const total = d3.sum(days, (d) => d.count);
  const max = d3.max(days, (d) => d.count) ?? 0;
  const level = d3.scaleQuantize<number>([1, Math.max(2, max + 1)], [1, 2, 3, 4]);
  const w = weeks * step, h = 7 * step;
  const svg = d3.create("svg").attr("class", "heat").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h)
    .attr("role", "img").attr("aria-label", `${total} commits over the last ${days.length} days, busiest day ${max}`);
  svg.selectAll("rect").data(days).join("rect")
    .attr("class", (d) => `l${d.count ? level(d.count) : 0}`)
    .attr("x", (_, i) => Math.floor((first + i) / 7) * step)
    .attr("y", (_, i) => ((first + i) % 7) * step)
    .attr("width", cell).attr("height", cell)
    .append("title").text((d) => `${d.date}: ${d.count} commit${d.count === 1 ? "" : "s"}`);
  const wrap = el("div", "", "heat-wrap", { tabindex: "0", role: "region", "aria-label": "Commit heatmap, scrollable" });
  add(wrap, svg.node() as unknown as SVGElement);
  const out = el("div");
  add(out, wrap, el("p", `${total} commits in the last ${days.length} days.`, "muted"));
  return out;
}

export function renderHeatmap(res: Res<Heat>) {
  show("heatmap", res, (h) => heat(h.days));
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
