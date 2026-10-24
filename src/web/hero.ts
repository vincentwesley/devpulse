import { add, el, link, show, type Res, type Stats } from "./api";
import { compact } from "./ui";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Show text(n) in the node; count up from 0 via rAF unless reduced motion (final value immediately). */
function countUp(node: HTMLElement, n: number, text: (n: number) => string, animate: boolean) {
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

/** Tiles worth showing: a zero or missing figure is hidden, not displayed. */
export function heroTiles(s: Stats): [string, number, (n: number) => string][] {
  const approx = (n: number) => `≈${compact(n)}`;
  const items: [string, number | null | undefined, (n: number) => string][] = [
    [s.approx ? "repos (public + private)" : "repos", s.totals?.repos, s.approx ? (n) => `${compact(n)}+` : compact],
    ["commits", s.totals?.commits, s.approx ? approx : compact],
    ["lines changed (est.)", s.totals?.loc, s.approx ? approx : compact],
    ["current streak (days)", s.streak?.current, compact],
    ["contributions this year", s.contributionsThisYear, compact],
  ];
  return items.filter((i): i is [string, number, (n: number) => string] => typeof i[1] === "number" && i[1] > 0);
}

const repoHref = (repo: string) => "https://github.com/" + repo.split("/").map(encodeURIComponent).join("/");
let first = true;

export function renderHero(stats: Res<Stats>) {
  const run = () => show("hero", stats, (s) => {
    const dl = el("dl", "", "hero__stats", { tabindex: "0" }); // scrollable on mobile: keyboard reachable
    const tile = (label: string, value: Node | string) => {
      const dd = el("dd", "", "hero__num");
      add(dd, value);
      const box = el("div", "", "hero__stat");
      add(box, el("dt", label, "muted"), dd);
      add(dl, box);
      return dd;
    };
    const animate = first;
    for (const [label, n, fmt] of heroTiles(s)) countUp(tile(label, ""), n, fmt, animate);
    const m = s.mostActive30d;
    if (m && m.commits > 0) {
      const dd = tile("Most active (30d)", link(m.name, repoHref(m.repo)));
      dd.classList.add("hero__num--txt");
      add(dd, el("span", ` ${compact(m.commits)} commits`, "muted"));
    }
    return dl;
  });
  const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  if (!first && vt && !reduced()) vt.call(document, run);
  else run();
  first = false;
}
