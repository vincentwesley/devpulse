import "./style.css";

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

import { getCommits, getHeatmap, getPosts, getProjects } from "./api";
import { renderCommits, renderHeatmap } from "./heatmap";
import { renderPosts } from "./posts";
import { renderProjects } from "./projects";

async function render() {
  await Promise.all([
    getProjects().then(renderProjects),
    getHeatmap().then(renderHeatmap),
    getCommits().then(renderCommits),
    getPosts().then(renderPosts),
  ]);
  document.body.dataset.loaded = "1";
}
render();
setInterval(() => {
  if (!document.hidden) render();
}, 60_000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});
