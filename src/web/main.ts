import "./style.css";
import "./shell.css";
import { getCommits, getHeatmap, getLanguages, getPosts, getProjects, getStats, getStatus, type Commit, type Heat, type Languages, type Post, type Res, type Stats } from "./api";
import { renderActivity } from "./activity";
import { renderContrib, renderFeatured, renderLangs, renderPulse, renderTotals } from "./bento";
import { icon } from "./icons";
import { openPalette, initPalette, setPaletteProjects } from "./palette";
import { initMotion } from "./motion";
import { renderPosts } from "./posts";
import { renderProjects } from "./projects";
import { renderRoute, setProjects, setStatus } from "./projectpage";
import { renderHealth } from "./shell";
import { renderUptime } from "./status";
import { settle, updatedAgo } from "./ui";

const root = document.documentElement;
const btn = document.querySelector<HTMLButtonElement>("#theme")!;

function setTheme(t: "dark" | "light", save = false) {
  root.dataset.theme = t;
  btn.replaceChildren(icon(t === "dark" ? "sun" : "moon", 20));
  btn.setAttribute("aria-label", t === "dark" ? "Light mode" : "Dark mode");
  btn.setAttribute("aria-pressed", String(t === "light"));
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#11150e" : "#eef7f1");
  if (save) try { localStorage.setItem("theme", t); } catch {}
}
setTheme(root.dataset.theme === "light" ? "light" : "dark"); // theme-init.js already set it before paint
btn.addEventListener("click", () => setTheme(root.dataset.theme === "light" ? "dark" : "light", true));
const kbd = document.querySelector<HTMLButtonElement>("#kbd")!;
kbd.insertBefore(icon("command", 20), kbd.firstChild);
kbd.addEventListener("click", openPalette);

if (!navigator.webdriver) root.dataset.reveal = ""; // scroll reveal for real users only

// ---- data: each endpoint fetched once per refresh, results shared. Slow endpoints are cached between fast refreshes. ----
const offline = document.getElementById("offline")!;
const upd = document.getElementById("updated")!;
let syncedAt: string | null = null;
const tickUpdated = () => { upd.textContent = updatedAgo(syncedAt); };
const none = { state: "empty" } as const;
const last: { commits: Res<Commit[]>; heat: Res<Heat>; langs: Res<Languages>; posts: Res<Post[]>; stats: Res<Stats> } =
  { commits: none, heat: none, langs: none, posts: none, stats: none };
let lastFast = 0, lastSlow = 0;

const retry = () => refresh(true);
const done = <T>(id: string, p: Promise<T>, render: (r: T) => void) =>
  p.then(render).catch(() => {}).finally(() => settle(id, retry));

const run = async (slow: boolean) => {
  lastFast = Date.now();
  offline.hidden = navigator.onLine;
  const keep = <K extends keyof typeof last>(key: K, f: () => Promise<(typeof last)[K]>) =>
    slow ? f().then((r) => (last[key] = r)) : Promise.resolve(last[key]);
  // Projects, status and stats move every 15 min server-side; the rest hourly.
  const projects = getProjects(), status = getStatus();
  const stats = getStats().then((r) => (last.stats = r));
  const commits = keep("commits", getCommits);
  const heat = keep("heat", getHeatmap), langs = keep("langs", getLanguages), posts = keep("posts", getPosts);
  const jobs: Promise<unknown>[] = [
    Promise.all([projects, stats, status]).then(([p, s, st]) => renderHealth(p, s, st)).catch(() => {}),
    done("ledger", Promise.all([projects, commits, status]), ([p, c, st]) => {
      renderProjects(p, c, st);
      if (p.state === "ok") setPaletteProjects(p.data);
      setProjects(p, c.state === "ok" ? c.data : []);
    }),
    done("tile-featured", projects, renderFeatured),
    done("tile-pulse", Promise.all([projects, status]), ([p, st]) => renderPulse(p, st)),
    done("tile-totals", Promise.all([stats, projects]), ([s, p]) => renderTotals(s, p)),
    done("tile-contrib", Promise.all([heat, stats]), ([h, s]) => renderContrib(h, s)),
    done("tile-langs", langs, renderLangs),
    done("status", status, (s) => { renderUptime(s); setStatus(s); }),
    done("activity", commits, renderActivity),
    done("posts", posts, renderPosts),
    stats.then((s) => { syncedAt = s.state === "ok" ? s.data.syncedAt : null; tickUpdated(); }).catch(() => {}),
  ];
  if (slow) lastSlow = Date.now();
  await Promise.all(jobs);
};
// One refresh at a time. A call during a run is remembered (slow wins) and re-runs afterwards, so Retry is never dropped.
let running: Promise<void> | null = null, queued: boolean | null = null;
function refresh(slow: boolean): Promise<void> {
  if (running) { queued = !!queued || slow; return running; }
  running = (async () => {
    let next: boolean | null = slow;
    while (next !== null) {
      queued = null;
      await run(next).catch(() => {});
      next = queued as boolean | null;
    }
    running = null;
  })();
  return running;
}
renderRoute(); // /p/<name> direct load: show the page shell now, content once data arrives
initPalette();
refresh(true).then(() => { initMotion(document.querySelector("main")!); document.body.dataset.loaded = "1"; });
// One timer decides fast vs slow refresh, from timestamps.
setInterval(() => {
  tickUpdated();
  if (document.hidden) return;
  const now = Date.now();
  if (now - lastSlow >= 60 * 60_000 - 5000) refresh(true);
  else if (now - lastFast >= 5 * 60_000 - 5000) refresh(false);
}, 60_000);
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
