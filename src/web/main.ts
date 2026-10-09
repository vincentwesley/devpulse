import "./style.css";
import { getCommits, getHeatmap, getPosts, getProjects } from "./api";
import { renderCommits, renderHeatmap } from "./heatmap";
import { renderPosts } from "./posts";
import { renderProjects } from "./projects";

const root = document.documentElement;
const btn = document.querySelector<HTMLButtonElement>("#theme")!;

function setTheme(t: "dark" | "light") {
  root.dataset.theme = t;
  btn.textContent = t === "dark" ? "Light mode" : "Dark mode";
  btn.setAttribute("aria-pressed", String(t === "light"));
}
try {
  if (localStorage.getItem("theme") === "light") setTheme("light");
} catch {}
btn.addEventListener("click", () => {
  const t = root.dataset.theme === "light" ? "dark" : "light";
  setTheme(t);
  try {
    localStorage.setItem("theme", t);
  } catch {}
});

// In-flight guard: a call while the previous is still running is a no-op.
const once = (fn: () => Promise<unknown>) => {
  let busy = false;
  return async () => {
    if (busy) return;
    busy = true;
    try { await fn(); } finally { busy = false; }
  };
};
let lastProjects = 0;
const loadProjects = once(async () => {
  lastProjects = Date.now();
  renderProjects(await getProjects());
});
const loadRest = once(() =>
  Promise.all([getHeatmap().then(renderHeatmap), getCommits().then(renderCommits), getPosts().then(renderPosts)]));

Promise.all([loadProjects(), loadRest()]).then(() => { document.body.dataset.loaded = "1"; });
// Projects change every 15 min server-side; the rest hourly.
setInterval(() => { if (!document.hidden) loadProjects(); }, 5 * 60_000);
setInterval(() => { if (!document.hidden) loadRest(); }, 60 * 60_000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - lastProjects >= 60_000) loadProjects();
});
