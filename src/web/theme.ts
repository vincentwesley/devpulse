import { icon } from "./icons";

/** The header theme button (both pages). The inline head script already applied a stored "light" before paint. */
export function initTheme() {
  const root = document.documentElement;
  const btn = document.querySelector<HTMLButtonElement>("#theme")!;
  const set = (t: "dark" | "light", save = false) => {
    root.dataset.theme = t;
    btn.replaceChildren(icon(t === "dark" ? "sun" : "moon", 20));
    btn.setAttribute("aria-label", t === "dark" ? "Light mode" : "Dark mode");
    btn.setAttribute("aria-pressed", String(t === "light"));
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#11150e" : "#eef7f1");
    if (save) try { localStorage.setItem("theme", t); } catch {}
  };
  set(root.dataset.theme === "light" ? "light" : "dark");
  btn.addEventListener("click", () => set(root.dataset.theme === "light" ? "dark" : "light", true));
}
