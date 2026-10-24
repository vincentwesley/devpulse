import "./palette.css";
import { add, el, type Project } from "./api";
import { rankBy } from "./hubutil";
import { toHash } from "./urlstate";

interface Item { label: string; group: "Project" | "Section" | "Action"; run: () => void }

const SECTIONS: [string, string][] = [
  ["hero", "Hub"], ["projects", "Projects"], ["status", "Status"], ["heatmap", "Commit heatmap"],
  ["activity", "Activity"], ["languages", "Languages"], ["posts", "Latest posts"],
];
const SHORTCUTS: [string, string][] = [
  ["/ or Ctrl+K", "Open the command palette"], ["?", "Show this help"], ["Up / Down", "Move through results"],
  ["Enter", "Run the selected result"], ["Esc", "Close"],
];

let projects: Project[] = [];
let dlg: HTMLDialogElement | null = null;
let input: HTMLInputElement, list: HTMLUListElement, help: HTMLElement, hint: HTMLElement;
let shown: Item[] = [], sel = 0;
// Visible + announced (aria-live) feedback for actions, shown briefly.
const toast = el("p", "", "pal__toast", { role: "status", "aria-live": "polite", hidden: "" });
document.body.appendChild(toast);

/** Projects offered by the palette; called by renderProjects on each load. */
export const setPaletteProjects = (p: Project[]) => { projects = p; };

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function items(): Item[] {
  const out: Item[] = projects.map((p) => ({ label: p.name, group: "Project", run: () => { location.hash = toHash(p.name); } }));
  for (const [id, label] of SECTIONS)
    if (document.getElementById(id))
      out.push({ label, group: "Section", run: () => document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }) });
  out.push(
    { label: "Toggle theme", group: "Action", run: () => document.querySelector<HTMLButtonElement>("#theme")?.click() },
    { label: "Copy feed URL", group: "Action", run: () => {
      const say = (m: string) => { toast.textContent = m; toast.hidden = false; setTimeout(() => { toast.hidden = true; toast.textContent = ""; }, 2500); };
      navigator.clipboard?.writeText(`${location.origin}/feed.xml`).then(() => say("Feed URL copied"), () => say("Couldn't copy the feed URL")) ?? say("Couldn't copy the feed URL");
    } },
    { label: "Show keyboard shortcuts", group: "Action", run: () => open(true) },
  );
  return out;
}

function paint() {
  list.textContent = "";
  shown.forEach((it, i) => {
    const li = el("li", "", "pal__opt", { role: "option", id: `pal-o${i}`, "aria-selected": String(i === sel) });
    add(li, el("span", it.label), el("span", it.group, "pal__grp"));
    li.addEventListener("click", () => choose(i));
    add(list, li);
  });
  input.setAttribute("aria-activedescendant", shown.length ? `pal-o${sel}` : "");
  hint.textContent = shown.length ? `${shown.length} result${shown.length === 1 ? "" : "s"}` : "No matches";
  list.children[sel]?.scrollIntoView({ block: "nearest" });
}
function filter() {
  sel = 0;
  shown = rankBy(items(), input.value, (i) => i.label).slice(0, 30);
  paint();
}
function choose(i: number) {
  const it = shown[i];
  if (!it) return;
  dlg!.close();
  it.run();
}

function ensure() {
  if (dlg) return;
  dlg = el("dialog", "", "pal hs-card", { "aria-label": "Command palette" });
  input = el("input", "", "pal__in", { type: "text", role: "combobox", "aria-expanded": "true", "aria-controls": "pal-list", "aria-autocomplete": "list", "aria-label": "Search projects, sections and actions", placeholder: "Type to search…", autocomplete: "off", spellcheck: "false" });
  list = el("ul", "", "pal__list", { id: "pal-list", role: "listbox", "aria-label": "Results" });
  hint = el("p", "", "pal__hint muted", { role: "status" });
  help = el("div", "", "pal__help");
  add(help, el("h2", "Keyboard shortcuts", "pal__h"));
  const dl = el("dl", "", "pal__keys");
  for (const [k, v] of SHORTCUTS) { const g = el("div"); add(g, el("dt", k), el("dd", v)); add(dl, g); }
  add(help, dl);
  const x = el("button", "Close", "hs-btn hub-btn", { type: "button" });
  x.addEventListener("click", () => dlg!.close());
  add(help, x);
  add(dlg, input, list, hint, help);
  input.addEventListener("input", filter);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (shown.length) { sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length; paint(); }
    } else if (e.key === "Enter") { e.preventDefault(); choose(sel); }
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg!.close(); }); // backdrop
  document.body.appendChild(dlg);
}

function open(showHelp = false) {
  ensure();
  if (dlg!.open) dlg!.close();
  input.hidden = list.hidden = hint.hidden = showHelp;
  help.hidden = !showHelp;
  input.value = "";
  if (!showHelp) filter();
  dlg!.showModal();
  (showHelp ? help.querySelector("button")! : input).focus();
}

// A just-closed dialog's input can keep focus for a frame; that is not typing.
const typing = (t: EventTarget | null) => t instanceof Element && !!t.closest("input, textarea, select, [contenteditable]") && !t.closest("dialog:not([open])");

/** Wire the global shortcuts: `/` or Ctrl/Cmd+K opens the palette, `?` the shortcut help. */
export function initPalette() {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (dlg?.open) dlg.close();
      else open();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || typing(e.target)) return;
    if (e.key !== "/" && e.key !== "?") return;
    if (document.querySelector("dialog[open]")) return; // another modal owns the keyboard
    e.preventDefault();
    open(e.key === "?");
  });
}
