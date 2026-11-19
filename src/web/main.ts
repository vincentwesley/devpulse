import "./style.css";
import "./shell.css";
import { getCommits, getHeatmap, getLanguages, getPosts, getProjects, getStats, getStatus, type Commit, type Heat, type Languages, type Post, type Project, type Res, type Stats } from "./api";
import "./brand/logo-resize";
import { renderActivity } from "./activity";
import { renderContrib, renderFeatured, renderHygiene, renderLangs, renderPulse, renderTotals } from "./bento";
import { icon } from "./icons";
import { initTheme } from "./theme";
import { initOffline } from "./swreg";
import { renderPosts } from "./posts";
import { renderProjects, showFailing, showGaps } from "./projects";
import { renderRoute, setProjects, setStatus } from "./projectpage";
import { renderHealth, setAttnHandler } from "./shell";
import { renderUptime } from "./status";
import { settle, updatedAgo } from "./ui";

const root = document.documentElement;
initTheme();
const kbd = document.querySelector<HTMLButtonElement>("#kbd")!;
kbd.insertBefore(icon("command", 20), kbd.firstChild);
// The palette loads on idle (so the first use is instant), or on the first shortcut / click, whichever comes first.
let palProjects: Project[] = [];
let palMod: Promise<typeof import("./palette")> | undefined;
const loadPalette = () => (palMod ??= import("./palette").then((m) => {
  m.setPaletteProjects(palProjects);
  m.initPalette(); // adds its own shortcut listener...
  document.removeEventListener("keydown", early); // ...so the stub goes away
  return m;
}));
const typing = (t: EventTarget | null) => t instanceof Element && !!t.closest("input, textarea, select, [contenteditable]") && !t.closest("dialog:not([open])");
function early(e: KeyboardEvent) { // same triggers as palette.ts initPalette
  const k = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k";
  const s = !(e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || typing(e.target)) && (e.key === "/" || e.key === "?") && !document.querySelector("dialog[open]");
  if (!k && !s) return;
  e.preventDefault();
  loadPalette().then((m) => m.openPalette(s && e.key === "?"));
}
document.addEventListener("keydown", early);
kbd.addEventListener("click", () => loadPalette().then((m) => m.openPalette()));
const idle = (f: () => unknown) => ("requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 2000));

if (!navigator.webdriver) root.dataset.reveal = ""; // scroll reveal for real users only

// ---- data: each endpoint fetched once per refresh, results shared. Slow endpoints are cached between fast refreshes. ----
const offline = document.getElementById("offline")!;
const upd = document.getElementById("updated")!;
const updM = document.getElementById("updated-m")!;
let syncedAt: string | null = null;
const tickUpdated = () => { upd.textContent = updatedAgo(syncedAt); updM.textContent = upd.textContent.replace(/ ago$/, ""); };
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
      if (p.state === "ok") { palProjects = p.data; palMod?.then((m) => m.setPaletteProjects(p.data)); }
      setProjects(p, c.state === "ok" ? c.data : []);
    }),
    done("tile-featured", projects, renderFeatured),
    done("tile-hygiene", projects, (p) => renderHygiene(p, showGaps)),
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
setAttnHandler(showFailing);
renderRoute(); // /p/<name> direct load: show the page shell now, content once data arrives
refresh(true).then(() => {
  document.body.dataset.loaded = "1";
  // Lazy chunks arrive once the page is quiet, one after another: motion (enhancement), then detail (so opening a row is instant and offline works).
  idle(() => import("./motion").then((m) => m.initMotion(document.querySelector("main")!)).then(() => idle(() => { import("./detail"); })));
});
loadPalette(); // small chunk, requested alongside the data so the first shortcut press finds it ready
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
initOffline(offline);
