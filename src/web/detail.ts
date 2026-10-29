import { create, max as dmax } from "d3";
import { add, COLLECTING, el, fmtDate, GAP_LABEL, link, NODATA, SOURCE_LABEL, staleText, type Commit, type Project, type Status } from "./api";
import { icon } from "./icons";
import { commitsFor, dayClass, firstLine, fmtPct, openIncidentRepos, readmeBlocks, relTime, rowState, safeColor, siteFor, STATE_TEXT } from "./hubutil";
import { band, linear } from "./scale";
import { actions, copyBlock, langBar, pills, snapshot } from "./showcase";
import { stageChip, staleMark } from "./stage";
import { lastBars, windowPct } from "./status";

const narrow = () => matchMedia("(max-width: 639.98px)").matches;

const wkLabel = (sec: number) => new Date(sec * 1000).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });

export function freqChart(p: Project) {
  const w = 520, h = 190, m = 6, data = p.codeFreq, axis = 28;
  const max = dmax(data, (d) => Math.max(d.add, d.del)) || 1;
  const bd = band(data.length, [m, w - m], 0.2), x = bd.x;
  const mid = (h - axis) / 2;
  const y = linear([0, max], [0, mid - m]);
  const wrap = el("div", "", "hub-chartwrap");
  const out = el("p", "Tap or focus a week for its numbers.", "hub-readout muted", { role: "status" });
  const svg = create("svg").attr("class", "hub-chart").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "group")
    .attr("aria-label", `Weekly lines added and deleted, last ${data.length} weeks. Arrow keys move between weeks.`);
  svg.append("line").attr("x1", m).attr("x2", w - m).attr("y1", mid).attr("y2", mid).attr("stroke", "var(--border-strong)");
  const cols = svg.selectAll("g.wk").data(data).join("g").attr("class", "wk-col")
    .attr("tabindex", (_, i) => (i === 0 ? 0 : -1)).attr("role", "img")
    .attr("aria-label", (d) => `Week of ${wkLabel(d.week)}: ${d.add} added, ${d.del} deleted`);
  cols.append("rect").attr("class", "hit").attr("fill", "transparent").attr("x", (_, i) => x(i) - 1).attr("width", bd.width + 2).attr("y", 0).attr("height", h - axis);
  cols.append("rect").attr("class", "add").attr("fill", "var(--accent)").attr("x", (_, i) => x(i)).attr("width", bd.width)
    .attr("y", (d) => mid - y(d.add)).attr("height", (d) => y(d.add));
  cols.append("rect").attr("class", "del").attr("fill", "var(--fx-2)").attr("x", (_, i) => x(i)).attr("width", bd.width)
    .attr("y", mid).attr("height", (d) => y(d.del));
  const step = Math.max(1, Math.ceil(data.length / 5));
  svg.selectAll("text.ax").data(data.map((d, i) => ({ d, i })).filter((o) => o.i % step === 0)).join("text").attr("class", "hub-ax")
    .attr("x", (o) => x(o.i) + bd.width / 2).attr("y", h - 6).attr("text-anchor", "middle").text((o) => wkLabel(o.d.week));
  const node = svg.node() as unknown as SVGSVGElement;
  const show = (i: number) => {
    const d = data[i];
    out.textContent = `Week of ${wkLabel(d.week)}: +${d.add.toLocaleString("en")} added, -${d.del.toLocaleString("en")} deleted`;
  };
  const colEls = [...node.querySelectorAll<SVGGElement>("g.wk-col")];
  colEls.forEach((g, i) => {
    g.addEventListener("focus", () => show(i));
    g.addEventListener("click", () => show(i));
    g.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(i); });
    g.addEventListener("keydown", (e) => {
      const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? colEls.length - 1 : -1;
      if (n < 0 || n >= colEls.length) return;
      e.preventDefault();
      colEls[i].setAttribute("tabindex", "-1");
      colEls[n].setAttribute("tabindex", "0");
      colEls[n].focus();
    });
  });
  add(wrap, node, out);
  return wrap;
}

export function copyRow(label: string, text: string) {
  const row = el("div", "", "hub-copy");
  const note = el("span", "", "muted hub-note", { role: "status", "aria-live": "polite" });
  const btn = el("button", "Copy", "hs-btn hub-btn", { type: "button", "aria-label": `Copy ${label} snippet` });
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      note.textContent = "Copied";
    } catch {
      note.textContent = "Copy failed, select the text instead";
    }
  });
  const r = el("div", "", "hub-row");
  add(r, btn, note);
  add(row, el("code", text, "hub-snippet"), r);
  return row;
}

export function commitList(p: Project, commits: Commit[], max = 8) {
  const cs = commitsFor(p, commits).slice(0, max);
  if (!cs.length) return el("p", "no commits yet", "muted");
  const ul = el("ul", "", "list");
  for (const c of cs) {
    const li = el("li");
    add(li, link(firstLine(c.message), c.url), el("span", ` ${relTime(c.ts) || fmtDate(c.ts)}`, "muted"));
    add(ul, li);
  }
  return ul;
}

const LH: [keyof NonNullable<Project["lighthouse"]>, string][] = [
  ["performance", "Perf"], ["accessibility", "A11y"], ["best_practices", "Best"], ["seo", "SEO"],
];
const grade = (n: number) => (n >= 90 ? "good" : n >= 50 ? "needs work" : "poor");

/** Uptime % + a 30 (phone) / 90 day strip from the shared status data. */
function uptimeBlock(p: Project, st: Status | null) {
  const box = el("div", "", "dt-up");
  if (!p.url) return add(box, el("p", "no live site", "meta")), box;
  const s = siteFor(p, st);
  if (!s) return add(box, el("p", NODATA, "meta")), box;
  const n = narrow() ? 30 : 90;
  const bars = lastBars(s.days, n);
  const pct = windowPct(bars);
  const head = el("p", pct === null ? NODATA : `${fmtPct(pct)} uptime, last ${bars.length} days`, "meta dt-uppct");
  const strip = el("div", "", "up-bar up-bar--lg", { role: "img", "aria-label": pct === null ? "No uptime checks yet" : `Daily uptime, last ${bars.length} days: ${fmtPct(pct)}` });
  for (const d of bars) {
    const c = dayClass(d);
    add(strip, el("i", "", "", { "data-c": c.cls, title: `${d.date}: ${c.pct === null ? "no checks" : fmtPct(c.pct)}` }));
  }
  add(box, head, strip);
  return box;
}

const when = (iso: string | null | undefined) => (iso ? `${relTime(iso) || fmtDate(iso)}` : "");
/** Last check / refresh times and where the live URL came from. Null when the API has none of them. */
export function freshness(p: Project) {
  const dl = el("dl", "", "dt-fresh");
  const row = (k: string, v: string, title = "") => { if (!v) return; const g = el("div"); add(g, el("dt", k), el("dd", v, "", title ? { title } : {})); add(dl, g); };
  row("Repo checked", when(p.checkedAt), p.checkedAt ?? "");
  row("Showcase refreshed", when(p.detailAt), p.detailAt ?? "");
  if (p.url) row("Uptime checked", when(p.uptimeAt), p.uptimeAt ?? "");
  if (p.shot || p.shotAt) row("Snapshot taken", when(p.shotAt), p.shotAt ?? "");
  if (p.url && p.urlSource) row("Live URL", `found via ${SOURCE_LABEL[p.urlSource] ?? p.urlSource}`);
  if (p.stale) row("Stale", staleText(p.staleWhy) || "yes");
  if (!dl.children.length) return null;
  return dl;
}

export interface DetailOpts {
  /** Title heading level: 1 on the full page, 3 inside the pane (under the "Projects" h2). */
  lvl: 1 | 3;
  commits: Commit[];
  status: Status | null;
  /** Currently filtered topic, and the handler that toggles one (returns the new active topic). */
  topic: () => string;
  onTopic: (t: string) => string;
  /** Pane only: close button. */
  onClose?: () => void;
}

/** One project's detail, shared by the sticky pane and the full page. textContent only; links https-only via link(). */
export function buildDetail(p: Project, o: DetailOpts): HTMLElement {
  const page = o.lvl === 1;
  const root = el("div", "", `dt ${page ? "dt--page" : "dt--pane"}`);
  const sec = (title: string, ...kids: (Node | string)[]) => {
    const d = el("div", "", "dt-sec");
    add(d, el(`h${o.lvl + 1}` as "h2", title, "micro dt-h"), ...kids);
    return d;
  };

  if (o.onClose) {
    const b = el("button", "", "hs-btn hub-btn dt-close", { type: "button", "aria-label": `Close ${p.name} details` });
    add(b, icon("close", 16), el("span", "Close"));
    b.addEventListener("click", o.onClose);
    add(root, b);
  }
  add(root, snapshot(p, "lg", p.shot ? `Screenshot of ${p.name}'s live site` : ""));

  const head = el("div", "", "dt-head");
  add(head, el(`h${o.lvl}` as "h1", p.name, "dt-title", { tabindex: "-1" }));
  if (p.tagline) add(head, el("p", p.tagline, "dt-tag"));
  if (p.description && p.description !== p.tagline) add(head, el("p", p.description, "hub-desc"));
  const st = stageChip(p), sm = staleMark(p);
  if (st || sm) { const r = el("div", "", "lg-meta"); add(r, ...[st, sm].filter((x): x is HTMLElement => !!x)); add(head, r); }
  add(head, pills(p), uptimeBlock(p, o.status), actions(p, false));
  add(root, head);

  // Health summary for screen readers; the dot in the ledger carries the same words.
  const rs = rowState(p, openIncidentRepos(o.status));
  add(head, el("p", `Overall: ${STATE_TEXT[rs]}`, "sr-only"));

  const dl = el("dl", "", "dt-stats");
  const row = (k: string, v: string) => { const g = el("div"); add(g, el("dt", k), el("dd", v)); add(dl, g); };
  row("Stars", p.stars.toLocaleString("en"));
  row("Forks", p.forks.toLocaleString("en"));
  if (p.license) row("License", p.license);
  if (p.commitCount != null) row("Commits", p.commitCount.toLocaleString("en"));
  if (p.loc != null && p.loc > 0) row("Lines changed (est.)", p.loc.toLocaleString("en"));
  if (p.createdAt) row("Created", `${fmtDate(p.createdAt)} → now`);
  if (p.release) row("Release", `${p.release.tag}${p.release.at ? ` · ${fmtDate(p.release.at)}` : ""}`);
  add(root, dl);

  if (p.readme) {
    const box = el("div", "", "pp-read");
    let ul: HTMLElement | null = null;
    for (const b of readmeBlocks(p.readme, page ? 60 : 12)) {
      if (b.kind === "li") { if (!ul) add(box, (ul = el("ul"))); add(ul, el("li", b.text)); } // textContent only
      else { ul = null; add(box, el("p", b.text)); }
    }
    const kids: Node[] = [box];
    if (box.textContent!.length > 280 || box.children.length > 4) {
      box.id = `readme-${page ? "page" : "pane"}`;
      box.dataset.clamped = "";
      const more = el("button", "Read more", "hs-btn hub-btn pp-more", { type: "button", "aria-expanded": "false", "aria-controls": box.id });
      more.addEventListener("click", () => {
        const open = box.toggleAttribute("data-clamped") === false; // removed = expanded
        more.setAttribute("aria-expanded", String(open));
        more.textContent = open ? "Show less" : "Read more";
      });
      kids.push(more);
    }
    add(root, sec("README", ...kids));
  }

  if (p.languages?.length) {
    const ul = el("ul", "", "hub-langs");
    for (const l of p.languages) {
      const li = el("li");
      const dot = el("i", "", "hub-dot", { "aria-hidden": "true" });
      dot.style.background = safeColor(l.color);
      add(li, dot, `${l.lang} ${l.pct.toFixed(1)}%`);
      add(ul, li);
    }
    add(root, sec("Languages", langBar(p), ul));
  }

  if (p.codeFreq?.length) {
    const k = el("p", "", "muted");
    add(k, el("span", "added", "hub-key"), el("span", "deleted", "hub-key hub-key--del"));
    add(root, sec("Code activity, last 26 weeks", freqChart(p), k));
  } else add(root, sec("Code activity, last 26 weeks", el("p", COLLECTING, "muted")));

  add(root, sec("Recent commits", commitList(p, o.commits, page ? 8 : 5)));

  if (p.lighthouse) {
    const ul = el("ul", "", "hub-langs");
    for (const [k, label] of LH) add(ul, el("li", `${label} ${p.lighthouse[k] as number} ${grade(p.lighthouse[k] as number)}`));
    add(root, sec("Lighthouse", ul, el("p", `Week ${p.lighthouse.week}`, "muted")));
  }
  if (p.deps?.length) {
    const ul = el("ul", "", "hub-langs");
    for (const x of p.deps) { const li = el("li"); add(li, link(`${x.name}: ${x.indicator}`, x.url)); add(ul, li); }
    add(root, sec("Dependencies", ul));
  }

  if (p.links?.length) {
    const ul = el("ul", "", "list");
    for (const l of p.links) { const li = el("li"); add(li, link(l.label, l.url)); add(ul, li); }
    add(root, sec("Links", ul));
  }

  if (p.topics?.length) {
    const ul = el("ul", "", "hub-topics", { "aria-label": "Topics (select to filter the project list)" });
    const chips = p.topics.map((t) => {
      const li = el("li");
      const b = el("button", t, "hs-chip hub-topic", { type: "button", "aria-pressed": String(o.topic() === t) });
      b.addEventListener("click", () => {
        const now = o.onTopic(t);
        for (const c of chips) c.setAttribute("aria-pressed", String(c.textContent === now));
      });
      add(li, b);
      add(ul, li);
      return b;
    });
    add(root, sec("Topics", ul));
  }

  const fresh = freshness(p);
  if (fresh) add(root, sec("Freshness", fresh));
  if (p.audit?.length) {
    const ul = el("ul", "", "dt-gaps", { "aria-label": "Repo gaps" });
    for (const g of p.audit) add(ul, el("li", GAP_LABEL[g] ?? g));
    add(root, sec("Repo gaps", ul));
  }
  if (p.snippet) add(root, sec("README embed", el("p", "Paste into the repo's README: status card, live snapshot and links, kept current by DevPulse.", "muted"), copyBlock(`${p.name} README embed snippet`, p.snippet)));

  const n = encodeURIComponent(p.name);
  add(root, sec("Status badge", copyRow("badge", `![status](${location.origin}/badge/${n}.svg)`)),
    sec("Project card", copyRow("card", `![card](${location.origin}/card/${n}.svg)`)));
  return root;
}
