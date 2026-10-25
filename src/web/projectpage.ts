import { add, el, NODATA, type Commit, type Project, type Res, type Status } from "./api";
import { buildDetail, closeDetail, wide } from "./detail";
import { commitsFor, openIncidentRepos, siteFor } from "./hubutil";
import { navigate, navLink, setRouteHandler } from "./nav";
import { markSelected, showTopic, toggleTopic, topicNow } from "./projects";
import { parseProjectPath, parseUrl, toProjectPath } from "./urlstate";

const TITLE = "DevPulse";
const DESC = "Live health of the projects vincentwesley ships: uptime, CI, activity.";

let ps: Project[] = [];
let commits: Commit[] = [];
let projState: "loading" | Res<unknown>["state"] = "loading";
let status: Status | null = null;
let shown: string | null = null; // name rendered into #pp (full page), "" while loading; so background refreshes don't redraw under the reader
let pageKey = "";
let paneName: string | null = null; // name rendered into #detail-pane (desktop)
let paneKey = "";

const pp = () => document.getElementById("pp")!;
const pane = () => document.getElementById("detail-pane")!;
const live = el("p", "", "sc-live", { role: "status", "aria-live": "polite" });
document.body.appendChild(live);

export function setProjects(res: Res<Project[]>, cs: Commit[]) {
  projState = res.state;
  if (res.state === "ok") { ps = res.data; commits = cs; }
  renderRoute();
}
export function setStatus(res: Res<Status>) {
  status = res.state === "ok" ? res.data : null;
  renderRoute();
}

/** What the detail shows, so a background refresh only redraws when it changed. */
const keyOf = (p: Project) => JSON.stringify([p, siteFor(p, status), openIncidentRepos(status).has(p.repo), commitsFor(p, commits).slice(0, 8).map((c) => c.sha)]);

const detailOpts = (lvl: 1 | 3) => ({
  lvl, commits, status, topic: topicNow,
  onTopic: lvl === 3 ? toggleTopic : (t: string) => {
    const search = showTopic(t);
    navigate(`/${search}`);
    document.getElementById("ledger")?.scrollIntoView();
    return t;
  },
  ...(lvl === 3 ? { onClose: closeDetail } : {}),
});

const back = () => navLink("← All projects", "/", "hs-btn hub-btn hub-btn--alt pp-back");
function pageEl(p: Project) {
  const root = el("div", "", "pp");
  add(root, back(), buildDetail(p, detailOpts(1)));
  return root;
}

function notFound(name: string) {
  const root = el("div", "", "pp");
  const msg = projState === "ok" ? `No project named “${name}”.` : projState === "loading" ? "Loading…" : projState === "empty" ? NODATA : "couldn't load";
  add(root, back(),
    el("h1", projState === "ok" ? "Project not found" : "Project unavailable", "dt-title", { tabindex: "-1" }), el("p", msg, "hub-desc"));
  return root;
}

const meta = () => document.querySelector<HTMLMetaElement>('meta[name="description"]');
function head(title: string, desc: string) {
  document.title = title;
  meta()?.setAttribute("content", desc);
}
const headFor = (p: Project) => head(`${p.name} · ${TITLE}`, p.tagline ?? p.description ?? `${p.name} on ${TITLE}`);

function closePane() {
  if (paneName === null) return;
  paneName = null;
  paneKey = "";
  pane().hidden = true;
  pane().replaceChildren();
  markSelected(null);
}
function resetPage() {
  document.body.removeAttribute("data-view");
  pp().hidden = true;
  if (shown !== null) { shown = null; pageKey = ""; pp().replaceChildren(); }
}

/** Desktop: fill the sticky pane. */
function paintPane(name: string, p: Project | undefined) {
  if (!p) return closePane(); // still loading
  const key = keyOf(p), box = pane();
  if (paneName === name && (key === paneKey || box.contains(document.activeElement))) return;
  const fresh = paneName !== name;
  paneName = name;
  paneKey = key;
  box.replaceChildren(buildDetail(p, detailOpts(3)));
  box.hidden = false;
  if (!fresh) return;
  box.scrollTop = 0;
  markSelected(name, true);
  headFor(p);
  live.textContent = `${p.name} details`;
}

/** Phones / tablets, and unknown names: the full page. */
function paintPage(name: string, p: Project | undefined) {
  const root = pp();
  document.body.dataset.view = "project";
  root.hidden = false;
  if (shown === name && p) {
    const key = keyOf(p);
    if (key === pageKey || root.contains(document.activeElement)) return;
    pageKey = key;
    root.replaceChildren(pageEl(p));
    return;
  }
  if (projState === "loading") {
    root.setAttribute("aria-busy", "true");
    if (shown === null) { const k = el("div", "", "skel body", { "aria-hidden": "true" }); add(k, el("i"), el("i"), el("i")); root.replaceChildren(back(), k); }
    shown = "";
    return;
  }
  root.removeAttribute("aria-busy");
  shown = name;
  pageKey = p ? keyOf(p) : "";
  root.replaceChildren(p ? pageEl(p) : notFound(name));
  if (p) headFor(p);
  else head(`Not found · ${TITLE}`, DESC);
  live.textContent = p ? `${p.name} project page` : "Project not found";
  scrollTo(0, 0);
  root.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
}

/** List (with the pane when /p/<name> on desktop) or the project page, from the current path. */
export function renderRoute() {
  const legacy = parseUrl("", location.hash).p; // old #p/<name> links
  if (legacy && parseProjectPath(location.pathname) === null) history.replaceState(history.state, "", toProjectPath(legacy));
  const name = parseProjectPath(location.pathname);
  const p = name === null ? undefined : ps.find((x) => x.name === name);
  if (name !== null && wide() && (projState === "loading" || p)) {
    resetPage();
    paintPane(name, p);
    return;
  }
  closePane();
  if (name === null) {
    document.body.removeAttribute("data-view");
    pp().hidden = true;
    head(TITLE, DESC);
    if (shown !== null) {
      const was = shown;
      shown = null;
      pageKey = "";
      pp().replaceChildren();
      live.textContent = "All projects";
      const opener = [...document.querySelectorAll<HTMLElement>("a[data-vp]")].find((a) => a.dataset.vp === was && a.getClientRects().length);
      (opener ?? document.querySelector<HTMLElement>("main"))?.focus();
    }
    return;
  }
  paintPage(name, p);
}

addEventListener("popstate", renderRoute);
addEventListener("hashchange", renderRoute);
matchMedia("(min-width: 1024px)").addEventListener("change", renderRoute);
setRouteHandler(renderRoute);

// Esc closes the pane and puts focus back on its row.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented || paneName === null || document.querySelector("dialog[open]")) return;
  if (document.activeElement?.matches("input, select, textarea")) return;
  const name = paneName;
  [...document.querySelectorAll<HTMLElement>("a.lg-name")].find((a) => a.dataset.vp === name)?.focus();
  closeDetail();
});
