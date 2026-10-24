import { add, COLLECTING, el, fmtDate, link, NODATA, type Commit, type Project, type Res, type Status } from "./api";
import { commitList, copyRow, freqChart, timeline } from "./detail";
import { plural, readmeBlocks, safeColor } from "./hubutil";
import { navigate, navLink, setRouteHandler } from "./nav";
import { showTopic } from "./projects";
import { actions, cover, langBar, pills } from "./showcase";
import { site } from "./status";
import { parseProjectPath } from "./urlstate";

const TITLE = "DevPulse";
const DESC = "Live health of the projects vincentwesley ships: uptime, CI, activity.";

let ps: Project[] = [];
let commits: Commit[] = [];
let projState: "loading" | Res<unknown>["state"] = "loading";
let status: Status | null = null;
let shown: string | null = null; // name rendered into #pp, so background refreshes don't redraw under the reader
let upSlot: HTMLElement | null = null;

const pp = () => document.getElementById("pp")!;
const live = el("p", "", "sc-live", { role: "status", "aria-live": "polite" });
document.body.appendChild(live);

export function setProjects(res: Res<Project[]>, cs: Commit[]) {
  projState = res.state;
  if (res.state === "ok") { ps = res.data; commits = cs; }
  renderRoute();
}
export function setStatus(res: Res<Status>) {
  status = res.state === "ok" ? res.data : null;
  fillUptime();
}

function fillUptime() {
  const p = shown === null ? null : ps.find((x) => x.name === shown);
  if (!upSlot || !p) return;
  upSlot.replaceChildren();
  const s = p.url ? status?.sites.find((x) => x.repo === p.repo || x.name === p.name) : null;
  add(upSlot, s ? site(s) : el("p", p.url ? NODATA : "no live site", "muted"));
}

function section(title: string, ...kids: (Node | string)[]) {
  const s = el("div", "", "pp-sec");
  add(s, el("h2", title), ...kids);
  return s;
}

function stats(p: Project) {
  const dl = el("dl", "", "stats");
  const row = (k: string, v: string) => { const g = el("div"); add(g, el("dt", k), el("dd", v)); add(dl, g); };
  row("Stars", p.stars.toLocaleString("en"));
  row("Forks", p.forks.toLocaleString("en"));
  if (p.license) row("License", p.license);
  if (p.commitCount != null) row("Commits", p.commitCount.toLocaleString("en"));
  if (p.loc != null) row("Lines changed (est.)", p.loc.toLocaleString("en"));
  if (p.release) row("Release", `${p.release.tag}${p.release.at ? ` · ${fmtDate(p.release.at)}` : ""}`);
  return dl;
}

function readme(p: Project) {
  const box = el("div", "", "pp-read");
  let ul: HTMLElement | null = null;
  for (const b of readmeBlocks(p.readme)) {
    if (b.kind === "li") { if (!ul) add(box, (ul = el("ul"))); add(ul, el("li", b.text)); } // textContent only
    else { ul = null; add(box, el("p", b.text)); }
  }
  return box;
}

function build(p: Project) {
  const root = el("div", "", "pp");
  const head = el("div", "", "pp-head");
  add(head, el("h1", p.name, "pp-title", { tabindex: "-1" }));
  if (p.tagline) add(head, el("p", p.tagline, "pp-tag"));
  if (p.description && p.description !== p.tagline) add(head, el("p", p.description, "hub-desc"));
  add(head, pills(p), actions(p, false));
  add(root, navLink("← All projects", "/", "hs-btn hub-btn hub-btn--alt pp-back"), cover(p, "lg"), head);

  upSlot = el("div");
  add(root, section("Uptime", upSlot), stats(p));
  if (p.readme) add(root, section("README", readme(p)));

  const stack = section("Tech stack");
  if (p.languages?.length) {
    add(stack, langBar(p));
    const ul = el("ul", "", "hub-langs pp-chips");
    for (const l of p.languages) {
      const li = el("li");
      const dot = el("i", "", "hub-dot", { "aria-hidden": "true" });
      dot.style.background = safeColor(l.color);
      add(li, dot, `${l.lang} ${l.pct.toFixed(1)}%`);
      add(ul, li);
    }
    add(stack, ul);
  }
  if (p.topics?.length) {
    const ul = el("ul", "", "hub-topics pp-chips", { "aria-label": "Topics (select to filter the project list)" });
    for (const t of p.topics) {
      const li = el("li");
      const b = el("button", t, "hs-chip hub-topic", { type: "button" });
      b.addEventListener("click", () => {
        const search = showTopic(t);
        navigate(`/${search}`);
        document.getElementById("ledger")?.scrollIntoView();
      });
      add(li, b);
      add(ul, li);
    }
    add(stack, ul);
  }
  if (stack.children.length > 1) add(root, stack);

  add(root, section("Code activity, last 26 weeks", p.codeFreq?.length ? freqChart(p) : el("p", COLLECTING, "muted")));
  add(root, section("Timeline", timeline(p)), section("Recent commits", commitList(p, commits)));
  if (p.links?.length) {
    const ul = el("ul", "", "list");
    for (const l of p.links) { const li = el("li"); add(li, link(l.label, l.url)); add(ul, li); }
    add(root, section("Links", ul));
  }
  const n = encodeURIComponent(p.name);
  add(root, section("Status badge", copyRow("badge", `![status](${location.origin}/badge/${n}.svg)`)),
    section("Project card", copyRow("card", `![card](${location.origin}/card/${n}.svg)`)));
  return root;
}

function notFound(name: string) {
  const root = el("div", "", "pp");
  const msg = projState === "ok" ? `No project named “${name}”.` : projState === "loading" ? "Loading…" : projState === "empty" ? NODATA : "couldn't load";
  add(root, navLink("← All projects", "/", "hs-btn hub-btn hub-btn--alt pp-back"),
    el("h1", projState === "ok" ? "Project not found" : "Project unavailable", "pp-title", { tabindex: "-1" }), el("p", msg, "hub-desc"));
  return root;
}

const meta = () => document.querySelector<HTMLMetaElement>('meta[name="description"]');
function head(title: string, desc: string) {
  document.title = title;
  meta()?.setAttribute("content", desc);
}

/** Show the list or the project page for the current path. */
export function renderRoute() {
  const name = parseProjectPath(location.pathname);
  const root = pp();
  if (name === null) {
    document.body.removeAttribute("data-view");
    root.hidden = true;
    head(TITLE, DESC);
    if (shown !== null) {
      const back = shown;
      shown = null;
      upSlot = null;
      root.replaceChildren();
      live.textContent = "All projects";
      const opener = [...document.querySelectorAll<HTMLElement>("a[data-vp]")].find((a) => a.dataset.vp === back && a.getClientRects().length);
      (opener ?? document.querySelector<HTMLElement>("main"))?.focus();
    }
    return;
  }
  document.body.dataset.view = "project";
  root.hidden = false;
  const p = ps.find((x) => x.name === name);
  if (shown === name && p) return;
  if (projState === "loading") {
    root.setAttribute("aria-busy", "true");
    if (shown === null) { const k = el("div", "", "skel body", { "aria-hidden": "true" }); add(k, el("i"), el("i"), el("i")); root.replaceChildren(navLink("← All projects", "/", "hs-btn hub-btn hub-btn--alt pp-back"), k); }
    shown = "";
    return;
  }
  root.removeAttribute("aria-busy");
  shown = name;
  root.replaceChildren(p ? build(p) : notFound(name));
  fillUptime();
  head(p ? `${p.name} · ${TITLE}` : `Not found · ${TITLE}`, p ? (p.tagline ?? p.description ?? `${p.name} on ${TITLE}`) : DESC);
  live.textContent = p ? `${p.name} project page` : "Project not found";
  scrollTo(0, 0);
  root.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
}

addEventListener("popstate", renderRoute);
setRouteHandler(renderRoute);
