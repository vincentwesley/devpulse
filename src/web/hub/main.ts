// Project Hub entry ("/" and "/p/<name>"). Old dashboard links were already sent to /dev/ by public/hub-redirect.js.
import "../style.css";
import "../shell.css";
import { add, el, getProjects, type Project, type Res } from "../api";
import "../brand/logo-resize";
import { setRouteHandler } from "../nav";
import { initOffline } from "../swreg";
import { initTheme } from "../theme";
import { settle } from "../ui";
import { parseHubPath } from "../urlstate";
import { buildHubPage, hubNotFound, pitchOf, renderHub, titleOf } from "./hub";

initTheme();
initOffline(document.getElementById("offline")!);
if (!navigator.webdriver) document.documentElement.dataset.reveal = "";

const TITLE = "Project Hub · DevPulse";
const DESC = "Projects by Vin: what each one is, what it can do, and where to try it.";
let projects: Res<Project[]> | null = null;
let shown: string | null = null;

const pp = () => document.getElementById("pp")!;
const head = (t: string, d: string) => { document.title = t; document.querySelector('meta[name="description"]')?.setAttribute("content", d); };

/** "/" shows the gallery; "/p/<name>" the project's story page (same document, client routed). */
function route() {
  const name = parseHubPath(location.pathname);
  if (name === null) {
    document.body.removeAttribute("data-view");
    pp().hidden = true;
    head(TITLE, DESC);
    if (shown !== null) { shown = null; pp().replaceChildren(); document.querySelector<HTMLElement>("main")?.focus(); }
    return;
  }
  document.body.dataset.view = "project";
  pp().hidden = false;
  const p = projects?.state === "ok" ? projects.data.find((x) => x.name === name) : undefined;
  if (shown === name && p) return;
  if (!projects) { const k = el("div", "", "skel body", { "aria-hidden": "true" }); add(k, el("i"), el("i"), el("i")); pp().replaceChildren(k); return; }
  shown = name;
  pp().replaceChildren(p ? buildHubPage(p, projects.state === "ok" ? projects.data : []) : hubNotFound(name, projects.state));
  head(p ? `${titleOf(p)} · DevPulse` : `Not found · ${TITLE}`, p ? pitchOf(p) ?? DESC : DESC);
  scrollTo(0, 0);
  pp().querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
}
setRouteHandler(route);
addEventListener("popstate", route);
route();

const retry = () => load();
async function load() {
  projects = await getProjects(); // the hub needs nothing else: no commits, stats or health
  try { renderHub(projects); } finally { settle("hub", retry); }
  shown = null; // redraw the story page with fresh data
  route();
  document.body.dataset.loaded = "1";
}
void load();
