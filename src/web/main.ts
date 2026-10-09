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

// Sections keep their "no data yet" empty state until real endpoints land (M1+).
async function render() {
  try {
    const { ok } = (await (await fetch("/api/health")).json()) as { ok?: boolean };
    document.body.dataset.api = ok ? "up" : "down";
  } catch {
    document.body.dataset.api = "down";
  }
}
render();
