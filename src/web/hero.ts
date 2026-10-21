import { add, el, show, type Languages, type Res, type Stats } from "./api";

const nf = new Intl.NumberFormat("en");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Show n in the node; count up from 0 via rAF unless reduced motion (final value immediately). */
function countUp(node: HTMLElement, n: number) {
  node.textContent = nf.format(n);
  if (reduced() || n <= 0) return;
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / 900);
    node.textContent = nf.format(Math.round(n * (1 - (1 - p) ** 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function renderHero(stats: Res<Stats>, langs: Res<Languages>) {
  show("hero", stats, (s) => {
    const items: [string, number | null][] = [
      ["repos (public + private)", s.totals.repos],
      ["commits", s.totals.commits],
      ["lines changed (est.)", s.totals.loc],
      ["languages", langs.state === "ok" ? langs.data.all.length : null],
      ["current streak (days)", s.streak.current],
      ["contributions this year", s.contributionsThisYear],
    ];
    const dl = el("dl", "", "hero__stats");
    for (const [label, n] of items) {
      const dd = el("dd", n === null ? "-" : "", "hero__num");
      if (n !== null) countUp(dd, n);
      const box = el("div", "", "hero__stat");
      add(box, el("dt", label, "muted"), dd);
      add(dl, box);
    }
    return dl;
  });
}
