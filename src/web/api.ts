import { isHttps } from "../worker/lib/github-parse";

export type Res<T> = { state: "ok"; data: T } | { state: "empty" } | { state: "error" };

export interface Project {
  repo: string; name: string; url: string | null; up: boolean | null; uptime30d: number | null; latencyMs: number[];
  ci: { status: string; conclusion: string | null; url: string } | null;
  lighthouse: { week: string; performance: number; accessibility: number; best_practices: number; seo: number } | null;
  deps: { url: string; name: string; indicator: string }[];
  // Hub fields (GitHub GraphQL sync). Public repos only; private repos never appear here.
  ciState: string | null; // raw statusCheckRollup: SUCCESS | FAILURE | ERROR | PENDING | EXPECTED
  description: string | null; topics: string[]; language: string | null;
  stars: number; forks: number; createdAt: string | null; pushedAt: string | null;
  release: { tag: string; at: string | null } | null; license: string | null;
  commitCount: number | null; loc: number | null; // loc = additions + |deletions| churn, an estimate
  languages: Language[];
  codeFreq: { week: number; add: number; del: number }[]; // last 26 weeks, week = unix seconds
  // Showcase (from .devpulse.json + README). cover = same-origin `/img/<name>` or null; readme = plain-text excerpt (render via textContent).
  tagline: string | null; featured: boolean; cover: string | null; readme: string | null;
  links: { label: string; url: string }[];
  // Round 5 (hub sync). Optional so older cached responses still render.
  archived?: boolean; stage?: Stage; stale?: boolean; staleWhy?: StaleWhy[];
  checkedAt?: string | null; detailAt?: string | null; uptimeAt?: string | null; shotAt?: string | null;
  urlSource?: UrlSource | null; sheetId?: string | null;
  audit?: Gap[]; // gaps: what the repo is missing
  shot?: string | null; // same-origin `/shot/<name>.jpg?v=` or null
  snippet?: string; // README embed block (markdown)
  showcase?: ShowcaseData;
}
export type Stage = "archived" | "live-down" | "live-up" | "live-pending" | "released-extension" | "active" | "quiet";
export type StaleWhy = "list" | "uptime" | "detail";
export type UrlSource = "website" | "devpulse" | "package" | "wrangler" | "readme" | "pages";
export type Gap = "readme" | "screenshot" | "about" | "website" | "topics";
export interface ShowcaseData { summary: string | null; highlights: string[]; runThrough: { steps: string[]; commands: string[] }; images: { url: string; alt: string }[] }
export const STAGE_LABEL: Record<Stage, string> = {
  "live-up": "Live", "live-down": "Live, down", "live-pending": "Live, checking", "released-extension": "Released extension",
  active: "Active", quiet: "Quiet 30d+", archived: "Archived",
};
export const STAGES = Object.keys(STAGE_LABEL) as Stage[];
export const GAP_LABEL: Record<Gap, string> = { readme: "README explanation", screenshot: "README screenshot", about: "About description", website: "Website field", topics: "Topics" };
export const SOURCE_LABEL: Record<UrlSource, string> = {
  website: "GitHub Website field", devpulse: ".devpulse.json site", package: "package.json homepage", wrangler: "wrangler config", readme: "README link", pages: "GitHub Pages",
};
const STALE_LABEL: Record<StaleWhy, string> = { list: "repo list check overdue", uptime: "uptime check overdue", detail: "showcase refresh pending" };
export const staleText = (w: StaleWhy[] | undefined) => (w ?? []).map((x) => STALE_LABEL[x] ?? x).join(", ");
/** Same-origin image paths only (the API emits /shot/, /img/); anything else is dropped. */
export const sameOriginImg = (u: string | null | undefined) => (u && /^\/(shot|img)\//.test(u) ? u : null);
export interface Language { lang: string; bytes: number; color: string | null; pct: number }
export interface Languages { all: Language[] }
export interface Stats {
  streak: { current: number; longest: number };
  busiestWeekday: string | null; weekdayTotals: number[]; // Sunday..Saturday
  contributionsThisYear: number;
  mostActive30d: { repo: string; name: string; commits: number } | null;
  totals: { repos: number; commits: number; loc: number }; // public + private aggregates (rounded when approx)
  syncedAt: string | null; approx: boolean; // approx: private totals included and rounded
  health?: { stale: boolean; since: string | null; tokenDaysLeft: number | null; jobs?: Record<string, { ageMin: number | null; ok: boolean }> };
}
export interface SiteStatus { name: string; repo: string; url: string; up: boolean | null; uptime90d: number | null; days: { date: string; up: number; total: number }[] }
export interface Incident { name: string; start: string; end: string | null; status: number | null }
export interface Status { sites: SiteStatus[]; incidents: Incident[] }
export interface Commit { repo: string; sha: string; message: string; author: string; ts: string; url: string }
export const NODATA = "no data yet";
export const COLLECTING = "collecting data — updates daily"; // code frequency: the LOC job runs daily at 00:30 UTC
/** ISO timestamp -> YYYY-MM-DD. */
export const fmtDate = (s: string) => s.slice(0, 10);
export interface Post { title: string; url: string; published: string }
export interface Heat { days: { date: string; count: number }[] }

async function get<T>(path: string, isEmpty: (d: T) => boolean): Promise<Res<T>> {
  try {
    const r = await fetch(path);
    if (!r.ok) return { state: "error" };
    const data = (await r.json()) as T;
    return data == null || isEmpty(data) ? { state: "empty" } : { state: "ok", data };
  } catch {
    return { state: "error" };
  }
}
const noItems = (a: unknown[]) => !Array.isArray(a) || a.length === 0;

export const getProjects = () => get<Project[]>("/api/projects", noItems);
export const getCommits = () => get<Commit[]>("/api/commits", noItems);
export const getPosts = () => get<Post[]>("/api/posts", noItems);
export const getStats = () => get<Stats>("/api/stats", (s) => !s.totals?.repos);
export const getLanguages = () => get<Languages>("/api/languages", (l) => noItems(l.all));
export const getStatus = () => get<Status>("/api/status", (s) => noItems(s.sites));
export const getHeatmap = () => get<Heat>("/api/heatmap", (h) => noItems(h.days));

/** Create an element with text (textContent only) and optional class / attrs. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = "", attrs: Record<string, string> = {}) {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
/** appendChild loop: the workers-types Element.append overload shadows the DOM one. */
export const add = (p: Node, ...kids: (Node | string)[]) => {
  for (const k of kids) p.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
};
export const link = (text: string, href: string, cls = "") =>
  isHttps(href) ? el("a", text, cls, { href, target: "_blank", rel: "noopener noreferrer" }) : el("span", text, cls);

/** Replace the section body (everything after the h2) with the built node, or the empty/error message. */
export function show<T>(sectionId: string, res: Res<T>, build: (d: T) => HTMLElement) {
  const sec = document.getElementById(sectionId)!;
  if (res.state === "error" && sec.querySelector(":scope > .body:not(.skel)")) return; // a failed background refresh keeps the good data
  sec.querySelectorAll(":scope > .body, :scope > .empty").forEach((e) => e.remove());
  if (res.state === "ok") {
    const b = build(res.data);
    b.classList.add("body");
    add(sec, b);
  } else {
    add(sec, el("p", res.state === "empty" ? NODATA : "couldn't load", `empty${res.state === "error" ? " empty--err" : ""}`, { role: "status" }));
  }
}
