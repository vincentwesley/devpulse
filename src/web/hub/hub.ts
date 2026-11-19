// Project Hub home ("/"): a portfolio of what Vin has built. Spotlight bento, a sticky toolbar (kind tabs, search, order) and a gallery
// of uniform 16:10 cards. Deliberately no health numbers (CI, uptime, stars, commits, line counts, language %): those live on /dev/.
// Every word comes from the repo itself; a missing field is left out, and a project without a picture gets a typographic name tile.
import "./hub.css";
import { add, el, link, sameOriginImg, type Project, type Res } from "../api";
import { initialOf, tileBackground, tileColors } from "../hubutil";
import { navigate } from "../nav";
import { toHubPath } from "../urlstate";
import { galleryOrder, isKind, KIND_TAG, KINDS, kindOf, matches, pitchOf, sortBy, spotlight, titleOf, type Kind, type Order } from "./kind";
import { buildStory } from "./story";

export { galleryOrder, kindOf, pitchOf, titleOf };

/** Best real picture: live snapshot, declared cover, first README screenshot. null = use the name tile. */
export const bestImage = (p: Project) => sameOriginImg(p.shot) ?? sameOriginImg(p.cover) ?? sameOriginImg(p.showcase?.images[0]?.url) ?? null;

/** "today", "yesterday", "3 days ago", "2 months ago" (long words: friendlier than the dashboard's short units). */
export function updated(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  const d = Math.floor((now - t) / 864e5);
  if (d <= 0) return "Updated today";
  const f = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const [n, u]: [number, Intl.RelativeTimeFormatUnit] = d < 14 ? [d, "day"] : d < 60 ? [Math.round(d / 7), "week"] : d < 730 ? [Math.round(d / 30), "month"] : [Math.round(d / 365), "year"];
  return `Updated ${f.format(-n, u)}`;
}

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Client navigation with a cross-fade (and the clicked picture morphing into the story hero) where the browser supports it. */
export function go(path: string, from?: Element | null) {
  const vt = (document as Document & { startViewTransition?: (f: () => void) => unknown }).startViewTransition;
  if (!vt || reduced()) return navigate(path);
  const pic = from?.querySelector<HTMLElement>(".hb-media");
  if (pic) pic.style.viewTransitionName = "hb-pic";
  vt.call(document, () => { if (pic) pic.style.viewTransitionName = ""; navigate(path); });
}
/** Same-document link to a story page: real <a href> (new tab, copy link work), plain left click routes in place. */
export function storyLink(text: string, p: Project, cls: string, label = "", card?: Element | null) {
  const a = el("a", text, cls, { href: toHubPath(p.name) });
  if (label) a.setAttribute("aria-label", label);
  a.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(toHubPath(p.name), card ?? a.closest(".hb-card, .hb-spot"));
  });
  return a;
}

/** Typographic tile on the project's language colours. Decorative: the heading carries the name. */
export function nameTile(p: Project, cls: string, text = true) {
  const t = el("div", "", `${cls} hb-tile`, { "aria-hidden": "true" });
  t.style.background = tileBackground(tileColors(p.languages));
  if (text) add(t, el("span", initialOf(p.name), "hb-tile__i"), el("span", p.name, "hb-tile__n"));
  return t;
}
/**
 * The project's picture over its name tile: the tile shows while the image loads (it fades in on top) and stays if the image fails,
 * so a card never looks empty. No picture at all: just the tile. The frame keeps the 16:10 box, so nothing shifts.
 */
export function media(p: Project, cls: string, eager = false, src = bestImage(p), altText = "", tileText = true) {
  if (!src) return nameTile(p, cls);
  const frame = el("div", "", `${cls} hb-frame`);
  const alt = altText || (src === sameOriginImg(p.shot) ? `Screenshot of ${p.name}` : `${p.name} preview`);
  const img = el("img", "", "hb-frame__img", { src, alt, width: "1280", height: "800", loading: eager ? "eager" : "lazy", decoding: "async" });
  if (eager) img.setAttribute("fetchpriority", "high");
  const gone = () => { img.remove(); frame.classList.add("hb-frame--tile"); };
  img.addEventListener("error", gone, { once: true });
  img.addEventListener("load", () => { if (img.naturalWidth === 40 && img.naturalHeight === 21) gone(); else img.classList.add("is-loaded"); }); // 40x21 = the Worker's 404 placeholder
  add(frame, nameTile(p, "hb-frame__tile", tileText), img);
  return frame;
}

/** Kind as a small pixel label. */
export const kindLabel = (p: Project) => el("p", KIND_TAG[kindOf(p)], `hb-kind hb-kind--${kindOf(p)}`);

/** Up to n tech names: languages first (names only, never percentages), then topics. */
export function techChips(p: Project, n = 4) {
  const names = [...new Set([...(p.languages ?? []).map((l) => l.lang), ...(p.topics ?? []).filter((t) => t !== "devpulse-ignore")])].slice(0, n);
  const ul = el("ul", "", "hb-chips", { "aria-label": "Built with" });
  for (const t of names) add(ul, el("li", t, "hb-chip"));
  return names.length ? ul : null;
}

const blurbOf = (p: Project) => pitchOf(p);
/** Heading text plus, when the README title differs from the repo name, the repo name in small mono beneath. */
export function heading(p: Project, tag: "h1" | "h3", cls: string, id: string, attrs: Record<string, string> = {}) {
  const h = el(tag, titleOf(p), cls, { id, ...attrs });
  const t = titleOf(p);
  return t !== p.name ? [h, el("p", p.name, "hb-repo")] : [h];
}

let ids = 0;
/** Gallery card: 16:10 picture, kind, name, one-line pitch, tech, when; the whole card opens the story page. */
export function card(p: Project, opts: { eager?: boolean; compact?: boolean } = {}) {
  const id = `hb-c${++ids}`;
  const c = el("article", "", `hb-card${opts.compact ? " hb-card--compact" : ""}`, { "aria-labelledby": id });
  c.dataset.name = p.name;
  const fig = el("div", "", "hb-card__media");
  add(fig, media(p, "hb-media", opts.eager));
  const body = el("div", "", "hb-card__body");
  add(body, kindLabel(p), ...heading(p, "h3", "hb-name", id));
  const b = blurbOf(p);
  if (b) add(body, el("p", b, "hb-blurb"));
  if (!opts.compact) { const chips = techChips(p); if (chips) add(body, chips); }
  const foot = el("div", "", "hb-card__foot");
  const when = updated(p.pushedAt);
  if (when) add(foot, el("p", when, "hb-when"));
  const acts = el("div", "", "hb-acts");
  if (p.url && !opts.compact) add(acts, link("Try it", p.url, "hs-btn hb-btn"));
  add(acts, storyLink(p.url && !opts.compact ? "Details" : "View project", p, `hs-btn hb-btn${p.url && !opts.compact ? " hb-btn--alt" : ""}`, p.url && !opts.compact ? `Details about ${titleOf(p)}` : `View project: ${titleOf(p)}`, c));
  add(foot, acts);
  add(body, foot);
  add(c, fig, body);
  // The whole card is a target (a real link inside stays the keyboard / screen-reader path).
  c.addEventListener("click", (e) => {
    if (e.defaultPrevented || (e.target as Element).closest("a, button") || getSelection()?.toString()) return;
    go(toHubPath(p.name), c);
  });
  return c;
}

/** Spotlight tile (bento): bigger picture and type; the first one spans two rows on wide screens. */
function spot(p: Project, big: boolean) {
  const id = `hb-c${++ids}`;
  const c = el("article", "", `hb-spot${big ? " hb-spot--big" : ""}`, { "aria-labelledby": id });
  c.dataset.name = p.name;
  const fig = el("div", "", "hb-spot__media");
  add(fig, media(p, "hb-media", big));
  const body = el("div", "", "hb-spot__body");
  add(body, kindLabel(p), ...heading(p, "h3", "hb-name", id));
  const b = blurbOf(p);
  if (b) add(body, el("p", b, "hb-blurb"));
  const acts = el("div", "", "hb-acts");
  if (p.url) add(acts, link("Try it", p.url, "hs-btn hb-btn"));
  add(acts, storyLink(p.url ? "Details" : "View project", p, `hs-btn hb-btn${p.url ? " hb-btn--alt" : ""}`, p.url ? `Details about ${titleOf(p)}` : `View project: ${titleOf(p)}`, c));
  add(body, acts);
  add(c, fig, body);
  c.addEventListener("click", (e) => {
    if (e.defaultPrevented || (e.target as Element).closest("a, button") || getSelection()?.toString()) return;
    go(toHubPath(p.name), c);
  });
  return c;
}

export function grid(ps: Project[], opts: { compact?: boolean; eager?: number } = {}) {
  const ul = el("ul", "", `hb-grid${opts.compact ? " hb-grid--compact" : ""}`);
  ps.forEach((p, i) => { const li = el("li"); add(li, card(p, { compact: opts.compact, eager: i < (opts.eager ?? 0) })); add(ul, li); });
  return ul;
}

// ---- view state, kept in the URL (?kind=&search=&order=; "q"/"sort" belong to /dev/ and would be redirected there) ----
interface View { kind: Kind | ""; search: string; order: Order }
const readView = (): View => {
  const u = new URLSearchParams(location.search), k = u.get("kind");
  return { kind: isKind(k) ? k : "", search: (u.get("search") ?? "").slice(0, 80), order: u.get("order") === "az" ? "az" : "recent" };
};
function writeView(v: View) {
  const u = new URLSearchParams(location.search);
  for (const [k, val, def] of [["kind", v.kind, ""], ["search", v.search.trim(), ""], ["order", v.order, "recent"]] as const) { if (val && val !== def) u.set(k, val); else u.delete(k); }
  const q = u.toString();
  history.replaceState(history.state, "", `${location.pathname}${q ? `?${q}` : ""}${location.hash}`);
}
let lastHome = ""; // the home query the visitor left from, so "All projects" returns to the same filtered list
export const homeSearch = () => lastHome;

let last: Res<Project[]> | null = null;

function home(ps: Project[]) {
  const live = ps.filter((p) => !p.archived), arch = galleryOrder(ps.filter((p) => p.archived));
  const view = readView();
  const wrap = el("div", "", "hb");
  const spots = spotlight(ps);

  // Spotlight bento
  const spotSec = el("section", "", "hb-sec hb-spotlight", { "aria-labelledby": "hb-h-spot" });
  if (spots.length) {
    add(spotSec, el("h3", "Spotlight", "hb-eyebrow", { id: "hb-h-spot" }));
    const bento = el("div", "", `hb-bento hb-bento--${spots.length}`);
    spots.forEach((p, i) => add(bento, spot(p, i === 0)));
    add(spotSec, bento);
    add(wrap, spotSec);
  }

  // Sticky toolbar: kind tabs, search, order
  const bar = el("div", "", "hb-bar");
  const have = new Set(live.map(kindOf));
  const opts = KINDS.filter((o) => !o.k || have.has(o.k));
  const tabs = el("div", "", "hb-tabs", { role: "group", "aria-label": "Show" });
  const tabBtns = opts.map((o) => {
    const b = el("button", o.label, "hb-tab", { type: "button", "aria-pressed": String(o.k === view.kind) });
    b.addEventListener("click", () => { view.kind = o.k; for (const x of tabBtns) x.setAttribute("aria-pressed", String(x === b)); update(); });
    return b;
  });
  if (opts.length > 2) { add(tabs, ...tabBtns); add(bar, tabs); }
  const tools = el("div", "", "hb-tools");
  const sWrap = el("div", "", "hb-search");
  const sId = "hb-search-in";
  const sLabel = el("label", "Search projects", "sr-only", { for: sId });
  const input = el("input", "", "hb-search__in", { id: sId, type: "search", placeholder: "Search projects", autocomplete: "off", spellcheck: "false", "aria-keyshortcuts": "/" });
  input.value = view.search;
  add(sWrap, sLabel, input, el("kbd", "/", "hb-kbd", { "aria-hidden": "true" }));
  let t: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { view.search = input.value; update(); }, 120); });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape" && input.value) { e.preventDefault(); input.value = ""; view.search = ""; update(); } });
  const oWrap = el("div", "", "hb-order");
  const oId = "hb-order-sel";
  const sel = el("select", "", "hb-order__sel", { id: oId });
  for (const [v, l] of [["recent", "Recently updated"], ["az", "A to Z"]] as const) { const o = el("option", l, "", { value: v }); if (v === view.order) o.selected = true; add(sel, o); }
  sel.addEventListener("change", () => { view.order = sel.value === "az" ? "az" : "recent"; update(); });
  add(oWrap, el("label", "Sort", "hb-order__l", { for: oId }), sel);
  add(tools, sWrap, oWrap);
  add(bar, tools);
  add(wrap, bar);

  // Results
  const res = el("section", "", "hb-sec hb-results", { "aria-labelledby": "hb-h-all" });
  const head = el("div", "", "hb-results__head");
  const h = el("h3", "", "hb-h", { id: "hb-h-all" });
  const count = el("p", "", "hb-count", { role: "status", "aria-live": "polite" });
  add(head, h, count);
  const body = el("div", "", "hb-results__body");
  add(res, head, body);
  add(wrap, res);

  let archEl: HTMLElement | null = null;
  if (arch.length) {
    archEl = el("details", "", "hb-arch");
    add(archEl, el("summary", "Archive"), el("p", "Projects that are finished or no longer maintained.", "hb-fine"), grid(arch, { compact: true }));
    add(wrap, archEl);
  }

  function update() {
    writeView(view);
    lastHome = location.search;
    const narrowed = !!(view.kind || view.search.trim());
    const found = sortBy(live.filter((p) => (!view.kind || kindOf(p) === view.kind) && matches(p, view.search)), view.order);
    // Unfiltered: the spotlight projects are already on show above, so the gallery lists the rest.
    const inSpot = new Set(spots.map((p) => p.name));
    const list = narrowed || view.order === "az" ? found : found.filter((p) => !inSpot.has(p.name));
    spotSec.hidden = narrowed;
    if (archEl) archEl.hidden = narrowed;
    h.textContent = narrowed ? (view.kind ? KINDS.find((o) => o.k === view.kind)!.label : "Search results") : spots.length && list.length !== found.length ? "More projects" : "All projects";
    count.textContent = narrowed ? `${found.length} of ${live.length} ${live.length === 1 ? "project" : "projects"}` : `${live.length} ${live.length === 1 ? "project" : "projects"}`;
    if (list.length) body.replaceChildren(grid(list, { eager: spots.length && !narrowed ? 0 : 2 }));
    else {
      const empty = el("div", "", "hb-empty", { role: "status" });
      const clear = el("button", "Clear filters", "hs-btn hb-btn hb-btn--alt", { type: "button" });
      clear.addEventListener("click", () => { view.kind = ""; view.search = ""; input.value = ""; for (const x of tabBtns) x.setAttribute("aria-pressed", String(x === tabBtns[0])); update(); input.focus(); });
      add(empty, el("p", narrowed ? "No projects match that." : "No projects yet.", "hb-empty__t"), ...(narrowed ? [clear] : []));
      body.replaceChildren(empty);
    }
  }
  update();
  return wrap;
}

function draw(res: Res<Project[]>, force = false) {
  const sec = document.getElementById("hub")!;
  if (!force && sec.contains(document.activeElement) && sec.querySelector(".hb")) return; // never redraw under keyboard focus
  sec.querySelectorAll(":scope > .body, :scope > .empty").forEach((e) => e.remove());
  if (res.state === "ok") { const b = home(res.data); b.classList.add("body"); add(sec, b); }
  else add(sec, el("p", res.state === "empty" ? "No projects yet." : "Couldn't load projects. Try again in a moment.", `empty${res.state === "error" ? " empty--err" : ""}`, { role: "status" }));
  sec.removeAttribute("aria-busy");
}

/** Fill #hub with every public project. Called on each data refresh. */
export function renderHub(res: Res<Project[]>) {
  last = res;
  draw(res);
}
if (typeof window !== "undefined") {
  addEventListener("popstate", () => { if (last && location.pathname === "/") draw(last, true); }); // unit tests import this without a DOM
  // "/" focuses the search (when not typing and nothing modal is open).
  addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || location.pathname !== "/") return;
    const tgt = e.target as Element | null;
    if (tgt?.closest?.("input, textarea, select, [contenteditable]") || document.querySelector("dialog[open]")) return;
    const s = document.getElementById("hb-search-in") as HTMLInputElement | null;
    if (!s || s.closest("[hidden]")) return;
    e.preventDefault();
    s.focus();
    s.select();
  });
}

/** The story page for one project, rendered into #pp at /p/<name>. */
export const buildHubPage = (p: Project, all: Project[] = []): HTMLElement => {
  const back = el("a", "← All projects", "hb-back", { href: `/${homeSearch()}` });
  back.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(`/${homeSearch()}`);
  });
  return buildStory(p, all, back);
};

/** Unknown /p/<name>. */
export function hubNotFound(name: string, state: Res<unknown>["state"] | "loading"): HTMLElement {
  const root = el("div", "", "hb-story hb-story--missing");
  const back = el("a", "← All projects", "hb-back", { href: "/" });
  back.addEventListener("click", (e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate("/"); });
  add(root,
    back,
    el("h1", state === "ok" ? "Project not found" : "Project unavailable", "hb-title", { tabindex: "-1" }),
    el("p", state === "ok" ? `There's no project called “${name}”. It may have been renamed or made private.` : state === "loading" ? "Loading…" : "Couldn't load projects. Try again in a moment.", "hb-lede"));
  return root;
}
