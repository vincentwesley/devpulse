import { animate, inView, stagger } from "motion";

// Enhancement only: content is visible by default; every animation is skipped under reduced motion.
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const SEL = ".proj, .act li, .stats > div";
let hoverBound = false;

function scan(root: HTMLElement) {
  if (reduced()) return;
  const els = [...root.querySelectorAll<HTMLElement>(SEL)].filter((e) => !e.dataset.mo);
  const step = stagger(0.06);
  els.forEach((e, i) => {
    e.dataset.mo = "1";
    try {
      inView(e, () => {
        if (reduced()) return;
        animate(e, { opacity: [0, 1], y: [18, 0] }, { type: "spring", stiffness: 260, damping: 22, delay: step(i % 8, 8) });
      }, { amount: 0.15 });
    } catch { /* stays visible */ }
  });
}

function hover(root: HTMLElement) {
  if (hoverBound) return;
  hoverBound = true;
  const lift = (e: Event, y: number) => {
    const t = (e.target as Element).closest<HTMLElement>(".proj");
    if (t && !reduced()) animate(t, { y }, { type: "spring", stiffness: 400, damping: 24 });
  };
  root.addEventListener("pointerover", (e) => lift(e, -4));
  root.addEventListener("pointerout", (e) => lift(e, 0));
}

/** Call after cards render; re-scans (cheaply, one rAF per burst) when the container re-renders. */
export function initMotion(root: HTMLElement) {
  scan(root);
  hover(root);
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(root); });
  }).observe(root, { childList: true, subtree: true });
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => scan(root));
}
