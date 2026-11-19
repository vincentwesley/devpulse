// Project Hub home ("/"): what each project is, what it can do, and pictures. Deliberately no health numbers (CI, uptime, stars,
// commits, line counts, language %): those live on /dev/. Every word comes from the repo itself; a missing field is left out.
import "./hub.css";
import { add, el, link, sameOriginImg, show, type Project, type Res } from "../api";
import { initialOf, tileBackground, tileColors } from "../hubutil";
import { navLink } from "../nav";
import { toHubPath } from "../urlstate";
import { buildStory } from "./story";

export type Kind = "live" | "ext" | "other";
export const KINDS: { k: Kind | ""; label: string }[] = [{ k: "", label: "All" }, { k: "live", label: "Live sites" }, { k: "ext", label: "Extensions" }, { k: "other", label: "Other" }];
const KIND_TAG: Record<Kind, string> = { live: "Live site", ext: "Browser extension", other: "Project" };
const EXT = /^(chrome|browser)-extension$|^firefox-addon$/;

/** Extension first (its Website may be a store page), then anything with a live URL. */
export const kindOf = (p: Pick<Project, "url" | "stage" | "topics">): Kind =>
  p.stage === "released-extension" || (p.topics ?? []).some((t) => EXT.test(t)) ? "ext" : p.url ? "live" : "other";

const pushed = (p: Project) => (p.pushedAt ? Date.parse(p.pushedAt) || 0 : 0);
/** Featured first, then the most recent push. */
export const galleryOrder = (ps: Project[]) => [...ps].sort((a, b) => Number(b.featured) - Number(a.featured) || pushed(b) - pushed(a) || a.name.localeCompare(b.name));

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

/** Typographic tile on the project's language colours. Decorative: the heading carries the name. */
export function nameTile(p: Project, cls: string) {
  const t = el("div", "", `${cls} hb-tile`, { "aria-hidden": "true" });
  t.style.background = tileBackground(tileColors(p.languages));
  add(t, el("span", initialOf(p.name), "hb-tile__i"), el("span", p.name, "hb-tile__n"));
  return t;
}
/** The project's picture, or the name tile when there is none (or it fails to load). */
export function media(p: Project, cls: string, eager = false) {
  const src = bestImage(p);
  if (!src) return nameTile(p, cls);
  const alt = src === sameOriginImg(p.shot) ? `Screenshot of ${p.name}` : `${p.name} preview`;
  const img = el("img", "", cls, { src, alt, width: "1280", height: "800", loading: eager ? "eager" : "lazy", decoding: "async" });
  const swap = () => img.replaceWith(nameTile(p, cls));
  img.addEventListener("error", swap, { once: true });
  img.addEventListener("load", () => { if (img.naturalWidth === 40 && img.naturalHeight === 21) swap(); }); // the Worker's 404 placeholder
  return img;
}

/** Kind tag + release version: the only "status" a visitor sees. */
export function tags(p: Project) {
  const ul = el("ul", "", "hb-tags", { "aria-label": "About this project" });
  add(ul, el("li", KIND_TAG[kindOf(p)], "hb-tag hb-tag--kind"));
  if (p.release) add(ul, el("li", p.release.tag, "hb-tag"));
  return ul;
}
/** Language names only (top n), never percentages. */
export function langNames(p: Project, n = 3) {
  const ul = el("ul", "", "hb-langs", { "aria-label": "Built with" });
  for (const l of (p.languages ?? []).slice(0, n)) add(ul, el("li", l.lang));
  return ul;
}

let ids = 0;
function card(p: Project, big = false) {
  const id = `hb-c${++ids}`;
  const c = el("article", "", `hb-card${big ? " hb-card--big" : ""}`, { "aria-labelledby": id });
  c.dataset.name = p.name;
  const body = el("div", "", "hb-body");
  add(body, el("h3", p.name, "hb-name", { id }));
  const blurb = p.tagline ?? p.description;
  if (blurb) add(body, el("p", blurb, "hb-blurb"));
  add(body, tags(p));
  if (p.languages?.length) add(body, langNames(p));
  const when = updated(p.pushedAt);
  if (when) add(body, el("p", when, "hb-when"));
  const acts = el("div", "", "hb-acts");
  if (p.url) add(acts, link("Try it", p.url, "hs-btn hb-btn"));
  const more = navLink("Read more", toHubPath(p.name), `hs-btn hb-btn${p.url ? " hb-btn--alt" : ""}`, `Read more about ${p.name}`);
  add(acts, more);
  add(body, acts);
  add(c, media(p, "hb-media", big), body);
  return c;
}

function grid(ps: Project[], big = false) {
  const ul = el("ul", "", `hb-grid${big ? " hb-grid--big" : ""}`);
  for (const p of ps) { const li = el("li"); add(li, card(p, big)); add(ul, li); }
  return ul;
}

const kindNow = (): Kind | "" => { const k = new URLSearchParams(location.search).get("kind"); return k === "live" || k === "ext" || k === "other" ? k : ""; };
let drawnKind: Kind | "" = ""; // the filter the home view was last drawn with (the story page URL has no ?kind)
/** "?kind=x" for links back to the home view, so the visitor returns to the list they left. */
export const homeSearch = () => (drawnKind ? `?kind=${drawnKind}` : "");

function filters(all: Project[], kind: Kind | "", onPick: (k: Kind | "") => void) {
  const have = new Set(all.map(kindOf));
  const opts = KINDS.filter((o) => !o.k || have.has(o.k));
  if (opts.length <= 2) return null; // one kind only: nothing to filter
  const g = el("div", "", "hb-filter", { role: "group", "aria-label": "Show" });
  for (const o of opts) {
    const b = el("button", o.label, "hb-chip", { type: "button", "aria-pressed": String(o.k === kind) });
    b.addEventListener("click", () => onPick(o.k));
    add(g, b);
  }
  return g;
}

let last: Res<Project[]> | null = null;

function home(ps: Project[]) {
  const kind = (drawnKind = kindNow());
  const wrap = el("div", "", "hb");
  const live = ps.filter((p) => !p.archived), arch = galleryOrder(ps.filter((p) => p.archived));
  const intro = el("div", "", "hb-intro");
  add(intro, el("p", "Things I've built: apps, experiments and tools. Open one to see what it does, or try it straight away.", "hb-lede"),
    el("p", `${live.length} ${live.length === 1 ? "project" : "projects"}`, "hb-count"));
  const f = filters(live, kind, (k) => {
    const u = new URLSearchParams(location.search);
    if (k) u.set("kind", k); else u.delete("kind");
    const q = u.toString();
    history.replaceState(history.state, "", `${location.pathname}${q ? `?${q}` : ""}${location.hash}`);
    if (last) draw(last, true);
  });
  if (f) add(intro, f);
  add(wrap, intro);
  const shown = galleryOrder(kind ? live.filter((p) => kindOf(p) === kind) : live);
  const feat = kind ? [] : shown.filter((p) => p.featured);
  if (feat.length) {
    const s = el("section", "", "hb-sec", { "aria-labelledby": "hb-h-feat" });
    add(s, el("h3", "Featured", "hb-h", { id: "hb-h-feat" }), grid(feat, true));
    add(wrap, s);
  }
  const rest = feat.length ? shown.filter((p) => !p.featured) : shown;
  if (rest.length) {
    const s = el("section", "", "hb-sec", { "aria-labelledby": "hb-h-all" });
    add(s, el("h3", feat.length ? "More projects" : kind ? (KINDS.find((o) => o.k === kind)!.label) : "All projects", "hb-h", { id: "hb-h-all" }), grid(rest));
    add(wrap, s);
  }
  if (!shown.length) add(wrap, el("p", "Nothing here yet.", "empty", { role: "status" }));
  if (arch.length && !kind) {
    const d = el("details", "", "hb-arch");
    add(d, el("summary", "Archive"), grid(arch));
    add(wrap, d);
  }
  return wrap;
}

function draw(res: Res<Project[]>, force = false) {
  const sec = document.getElementById("hub")!;
  if (!force && sec.contains(document.activeElement) && sec.querySelector(".hb")) return; // never redraw under keyboard focus
  const focusKind = force ? kindNow() : null;
  show("hub", res, home);
  sec.removeAttribute("aria-busy");
  if (focusKind !== null) sec.querySelector<HTMLElement>(`.hb-chip[aria-pressed="true"]`)?.focus();
}

/** Fill #hub with every public project. Called on each data refresh. */
export function renderHub(res: Res<Project[]>) {
  last = res;
  draw(res);
}
if (typeof window !== "undefined") addEventListener("popstate", () => { if (last && location.pathname === "/") draw(last, true); }); // unit tests import this without a DOM

/** The story page for one project, rendered into #pp at /p/<name>. */
export const buildHubPage = (p: Project): HTMLElement => buildStory(p, navLink("← All projects", `/${homeSearch()}`, "hs-btn hb-btn hb-btn--alt hb-back"));

/** Unknown /p/<name>. */
export function hubNotFound(name: string, state: Res<unknown>["state"] | "loading"): HTMLElement {
  const root = el("div", "", "hb-story");
  add(root,
    navLink("← All projects", "/", "hs-btn hb-btn hb-btn--alt hb-back"),
    el("h1", state === "ok" ? "Project not found" : "Project unavailable", "hb-title", { tabindex: "-1" }),
    el("p", state === "ok" ? `There's no project called “${name}”. It may have been renamed or made private.` : state === "loading" ? "Loading…" : "Couldn't load projects. Try again in a moment.", "hb-lede"));
  return root;
}
