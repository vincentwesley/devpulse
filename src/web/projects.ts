import * as d3 from "d3";
import { add, el, link, NODATA, show, type Project, type Res } from "./api";

const LH: [keyof NonNullable<Project["lighthouse"]>, string][] = [
  ["performance", "Perf"], ["accessibility", "A11y"], ["best_practices", "Best"], ["seo", "SEO"],
];
const grade = (n: number) => (n >= 90 ? "good" : n >= 50 ? "ok" : "poor");
const gradeWord: Record<string, string> = { good: "good", ok: "needs work", poor: "poor" };

function spark(ms: number[]) {
  const w = 120, h = 28;
  const [lo, hi] = d3.extent(ms) as [number, number];
  const svg = d3.create("svg").attr("class", "spark-line").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img")
    .attr("aria-label", `Latency, last ${ms.length} checks: min ${lo} ms, max ${hi} ms`);
  const x = d3.scaleLinear([0, Math.max(1, ms.length - 1)], [2, w - 2]);
  const y = d3.scaleLinear([lo, hi], [h - 3, 3]);
  svg.append("path").attr("fill", "none").attr("stroke", "currentColor").attr("stroke-width", 1.5)
    .attr("d", d3.line<number>().x((_, i) => x(i)).y((d) => (lo === hi ? h / 2 : y(d)))(ms));
  return svg.node() as unknown as SVGElement;
}

function card(p: Project) {
  const c = el("article", "", "proj");
  const head = el("div", "", "proj__head");
  const h3 = el("h3");
  add(h3, link(p.name, p.url));
  const pill = p.up === null ? el("span", NODATA, "pill pill--none") : el("span", p.up ? "▲ Up" : "▼ Down", `pill ${p.up ? "pill--up" : "pill--down"}`);
  add(head, h3, pill);

  const stats = el("dl", "", "proj__stats");
  const row = (k: string, v: Node | string) => {
    const g = el("div");
    const dd = el("dd");
    add(dd, v);
    add(g, el("dt", k), dd);
    add(stats, g);
  };
  row("Uptime 30d", p.uptime30d == null ? NODATA : `${p.uptime30d.toFixed(2)}%`);
  row("Latency", p.latencyMs?.length ? spark(p.latencyMs) : NODATA);
  const ci = p.ci;
  row("CI", ci ? link(ci.conclusion ?? ci.status, ci.url, `hs-chip ci ci--${ci.conclusion ?? ci.status}`) : NODATA);

  const lh = el("div", "", "lh");
  if (p.lighthouse) {
    for (const [k, label] of LH) {
      const n = p.lighthouse[k] as number;
      const g = grade(n);
      add(lh, el("span", `${label} ${n} ${gradeWord[g]}`, `score score--${g}`));
    }
  } else add(lh, el("span", `Lighthouse: ${NODATA}`, "muted"));

  const deps = el("ul", "", "deps", { "aria-label": "Dependency status" });
  for (const d of p.deps ?? []) {
    const li = el("li");
    add(li, link(`${d.name}: ${d.indicator}`, d.url, `hs-chip dep dep--${d.indicator}`));
    add(deps, li);
  }
  add(c, head, stats, lh);
  if (deps.children.length) add(c, deps);
  return c;
}

export function renderProjects(res: Res<Project[]>) {
  show("projects", res, (ps) => {
    const g = el("div", "", "grid");
    add(g, ...ps.map(card));
    return g;
  });
}
