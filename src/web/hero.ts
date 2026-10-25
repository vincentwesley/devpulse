import { add, el, link, type Stats } from "./api";
import { compact } from "./ui";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Show text(n) in the node; count up from 0 via rAF unless reduced motion (final value immediately). */
export function countUp(node: HTMLElement, n: number, text: (n: number) => string, animate: boolean) {
  node.textContent = text(n);
  if (!animate || reduced() || n <= 0) return;
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / 900);
    node.textContent = text(Math.round(n * (1 - (1 - p) ** 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Totals worth showing: a zero or missing figure is hidden, not displayed. Approximate totals get a leading ≈ (repos: trailing +). */
export function totalsItems(s: Stats): [string, number, (n: number) => string][] {
  const approx = (n: number) => `≈${compact(n)}`;
  const items: [string, number | null | undefined, (n: number) => string][] = [
    ["Repos", s.totals?.repos, s.approx ? (n) => `${compact(n)}+` : compact],
    ["Commits", s.totals?.commits, s.approx ? approx : compact],
    ["Lines (est.)", s.totals?.loc, s.approx ? approx : compact],
    ["This year", s.contributionsThisYear, compact],
  ];
  return items.filter((i): i is [string, number, (n: number) => string] => typeof i[1] === "number" && i[1] > 0);
}

const repoHref = (repo: string) => "https://github.com/" + repo.split("/").map(encodeURIComponent).join("/");
let first = true;

/** Totals tile body: label/value rows, then the most active repo of the last 30 days. */
export function totalsTile(s: Stats) {
  const dl = el("dl", "", "tot");
  const animate = first;
  first = false;
  const row = (label: string, value: Node | string, cls = "") => {
    const dd = el("dd", "", `tot__v ${cls}`.trim());
    add(dd, value);
    const d = el("div", "", "tot__row");
    add(d, el("dt", label), dd);
    add(dl, d);
    return dd;
  };
  for (const [label, n, fmt] of totalsItems(s)) countUp(row(label, ""), n, fmt, animate);
  const m = s.mostActive30d;
  if (m && m.commits > 0) {
    const dd = row("Top 30d", link(m.name, repoHref(m.repo)), "tot__v--txt");
    add(dd, el("span", ` ${compact(m.commits)} commits`, "tot__sub"));
  }
  return dl;
}
