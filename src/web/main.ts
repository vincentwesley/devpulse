import "./style.css";
import "./motion.css";
import "./hero.css";
import "./layout.css";
import { getCommits, getHeatmap, getLanguages, getPosts, getProjects, getStats, getStatus, type Commit, type Res } from "./api";
import { renderActivity } from "./activity";
import { renderHeatmap } from "./heatmap";
import { renderHero } from "./hero";
import { renderLanguages } from "./languages";
import { initMotion } from "./motion";
import { initPalette, setPaletteProjects } from "./palette";
import { renderPosts } from "./posts";
import { renderProjects } from "./projects";
import { renderStatus } from "./status";
import { settle, updatedAgo } from "./ui";

const root = document.documentElement;
const btn = document.querySelector<HTMLButtonElement>("#theme")!;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function setTheme(t: "dark" | "light", save = false) {
  root.dataset.theme = t;
  btn.textContent = t === "dark" ? "Light mode" : "Dark mode";
  btn.setAttribute("aria-pressed", String(t === "light"));
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#11150e" : "#eef7f1");
  if (save) try { localStorage.setItem("theme", t); } catch {}
}
setTheme(root.dataset.theme === "light" ? "light" : "dark"); // theme-init.js already set it before paint
btn.addEventListener("click", () => setTheme(root.dataset.theme === "light" ? "dark" : "light", true));

if (!navigator.webdriver) root.dataset.reveal = ""; // scroll reveal for real users only

// ---- section tabs: smooth scroll + scroll-spy ----
const tabs = [...document.querySelectorAll<HTMLAnchorElement>(".tabs a")];
const tabFor = (id: string) => tabs.find((a) => a.hash === `#${id}` || a.dataset.also === id);
const strip = document.querySelector<HTMLElement>(".tabs ul")!;
function current(id: string) {
  const t = tabFor(id);
  tabs.forEach((a) => (a === t ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
  if (t) strip.scrollTo({ left: t.offsetLeft - (strip.clientWidth - t.offsetWidth) / 2, behavior: reducedMotion() ? "auto" : "smooth" });
}
tabs.forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelector(a.hash)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  }),
);
{
  // Scroll-spy: the last section row whose top has passed the line; side-by-side cards resolve to the first in DOM order.
  const secs = [...document.querySelectorAll("main > section[id]")];
  let queued = false;
  const spy = () => {
    queued = false;
    const line = innerHeight * 0.35;
    let best: Element | undefined, bestTop = -Infinity;
    for (const s of secs) {
      const t = s.getBoundingClientRect().top;
      if (t <= line && t > bestTop + 1) { best = s; bestTop = t; }
    }
    if (best) current(best.id);
  };
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(spy); } }, { passive: true });
  addEventListener("resize", spy);
  spy();
}

// ---- data: each endpoint fetched once per refresh, results shared ----
// In-flight guard: a call while the previous is still running is a no-op.
const once = <A extends unknown[]>(fn: (...a: A) => Promise<unknown>) => {
  let busy = false;
  return async (...a: A) => {
    if (busy) return;
    busy = true;
    try { await fn(...a); } finally { busy = false; }
  };
};
const offline = document.getElementById("offline")!;
const upd = document.getElementById("updated")!;
let syncedAt: string | null = null;
const tickUpdated = () => { upd.textContent = updatedAgo(syncedAt); };
let lastCommits: Res<Commit[]> = { state: "empty" };
let lastFast = 0, lastSlow = 0;

const retry = () => void refresh(true);
const done = <T>(id: string, p: Promise<T>, render: (r: T) => void) =>
  p.then(render).catch(() => {}).finally(() => settle(id, retry));

const refresh = once(async (slow: boolean) => {
  lastFast = Date.now();
  offline.hidden = navigator.onLine;
  const commits = slow ? getCommits() : Promise.resolve(lastCommits);
  const jobs: Promise<unknown>[] = [
    done("projects", Promise.all([getProjects(), commits]), ([p, c]) => {
      renderProjects(p, c);
      if (p.state === "ok") setPaletteProjects(p.data);
    }),
    done("status", getStatus(), renderStatus),
  ];
  if (slow) {
    lastSlow = Date.now();
    const stats = getStats();
    jobs.push(
      done("hero", stats, (s) => {
        renderHero(s);
        syncedAt = s.state === "ok" ? s.data.syncedAt : null;
        tickUpdated();
      }),
      done("heatmap", Promise.all([getHeatmap(), stats]), ([h, s]) => renderHeatmap(h, s)),
      done("activity", commits.then((c) => (lastCommits = c)), renderActivity),
      done("languages", getLanguages(), renderLanguages),
      done("posts", getPosts(), renderPosts),
    );
  }
  await Promise.all(jobs);
});
initPalette();
refresh(true).then(() => { initMotion(document.querySelector("main")!); document.body.dataset.loaded = "1"; });
// Projects/status change every 15 min server-side; the rest hourly.
setInterval(() => { if (!document.hidden) refresh(false); }, 5 * 60_000);
setInterval(() => { if (!document.hidden) refresh(true); }, 60 * 60_000);
setInterval(tickUpdated, 60_000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  const now = Date.now();
  if (now - lastSlow >= 10 * 60_000) refresh(true);
  else if (now - lastFast >= 60_000) refresh(false);
});

// ---- offline banner + service worker ----
const syncOnline = () => { offline.hidden = navigator.onLine; };
addEventListener("online", syncOnline);
addEventListener("offline", syncOnline);
syncOnline();
if ("serviceWorker" in navigator) {
  try {
    navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.stale) offline.hidden = false; });
    addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  } catch {}
}
