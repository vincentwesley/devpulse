// Developer (health dashboard, default) vs Showcase (project gallery). URL `?mode=showcase` wins; else the stored choice.
import { add, el } from "./api";
import { parseMode, withMode, type Mode } from "./urlstate";

const web = typeof document !== "undefined"; // unit tests import modules that import this one, without a DOM
const root = web ? document.documentElement : ({ dataset: {} } as HTMLElement);
const stored = (): Mode | null => { try { const m = localStorage.getItem("mode"); return m === "showcase" || m === "dev" ? m : null; } catch { return null; } };
let mode: Mode = (web && (parseMode(location.search) ?? stored())) || "dev";
const subs: ((m: Mode) => void)[] = [];

export const getMode = () => mode;
/** Called after every mode change (and on Back/Forward when the URL changes it). */
export const onMode = (f: (m: Mode) => void) => { subs.push(f); };
/** The current URL's search with the mode kept in it (other modules rewrite the query). */
export const keepMode = (search: string) => withMode(search, mode);

const btns: HTMLButtonElement[] = [];
function apply(m: Mode, save: boolean) {
  const changed = m !== mode;
  mode = m;
  root.dataset.mode = m;
  for (const b of btns) b.setAttribute("aria-pressed", String(b.dataset.m === m));
  if (save) try { localStorage.setItem("mode", m); } catch {}
  const search = withMode(location.search, m);
  if (search !== location.search) history.replaceState(history.state, "", location.pathname + search + location.hash);
  if (changed) for (const f of subs) f(m);
}
export const setMode = (m: Mode) => apply(m, true);

/**
 * Segmented control: two real buttons, aria-pressed, 44px targets. Visible text stays in the accessible name.
 * Mounted twice (header on wide screens, top of the page on phones); CSS shows exactly one, so only one is ever in the a11y tree.
 */
export function initModeToggle(host: Element, cls = "") {
  const g = el("div", "", `modesw ${cls}`.trim(), { role: "group", "aria-label": "View mode" });
  for (const [m, long, short] of [["dev", "Developer", "Dev"], ["showcase", "Showcase", "Show"]] as const) {
    const b = el("button", "", "modesw__b", { type: "button", "aria-pressed": "false" });
    b.dataset.m = m;
    add(b, el("span", long, "modesw__l"), el("span", short, "modesw__s"));
    b.addEventListener("click", () => setMode(m));
    btns.push(b);
    add(g, b);
  }
  host.insertBefore(g, host.firstChild);
  apply(mode, false);
}

// Back/Forward to an entry with a different ?mode: follow the URL (no save, the stored choice stays the user's last click).
if (web) addEventListener("popstate", () => { const m = parseMode(location.search); if (m && m !== mode) apply(m, false); });
root.dataset.mode = mode;
