import type { Commit, Project, Stage, Status } from "./api";

export type Sort = "active" | "stars" | "name" | "status" | "lang" | "ci" | "uptime";
/** Ledger filter chips. live = healthy, failing = needs attention, wip = in progress or no signal. */
export type StatusFilter = "all" | "live" | "failing" | "wip";
/** Ledger stage select: "" = any, "gaps" = repos missing README/About/Website/topics, else one derived stage. */
export type StageFilter = "" | "gaps" | Stage;

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60],
];
/** "3 days ago" from an ISO timestamp; "" when missing/invalid. The single shared relTime. */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  const s = Math.round((t - now) / 1000);
  const f = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
  for (const [u, n] of UNITS) if (Math.abs(s) >= n) return f.format(Math.trunc(s / n), u);
  return "just now";
}

/** Only a strict #rrggbb colour reaches a style; anything else falls back to the accent. */
export const safeColor = (c: string | null | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : "var(--accent)");

/** Raw GitHub statusCheckRollup -> ci chip class + label. */
export function ciFromState(s: string | null): { cls: string; label: string } | null {
  if (!s) return null;
  if (s === "SUCCESS") return { cls: "success", label: "success" };
  if (s === "FAILURE" || s === "ERROR") return { cls: "failure", label: "failure" };
  return { cls: "pending", label: "pending" };
}

const pushed = (p: Project) => (p.pushedAt ? Date.parse(p.pushedAt) || 0 : 0);
const feat = (p: Project) => (p.featured ? 1 : 0);

export type RowState = "ok" | "attn" | "wip" | "none";
export const STATE_TEXT: Record<RowState, string> = { ok: "Healthy", attn: "Needs attention", wip: "In progress", none: "No signal" };
const failing = (p: Project) => p.ci?.conclusion === "failure" || p.ciState === "FAILURE" || p.ciState === "ERROR";
/** Repos with an open incident (same rule as the header verdict). */
export function openIncidentRepos(st: Status | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const i of st?.incidents ?? []) if (i.end === null) out.add(st!.sites.find((s) => s.name === i.name)?.repo ?? i.name);
  return out;
}
/** Ledger dot: attn = CI failure / site down / open incident; wip = CI pending; ok = a healthy signal; none = nothing to go on. */
export function rowState(p: Project, bad: Set<string> = new Set()): RowState {
  if (failing(p) || p.up === false || bad.has(p.repo)) return "attn";
  if (p.ciState === "PENDING" || p.ciState === "EXPECTED" || (p.ci && p.ci.conclusion === null)) return "wip";
  return p.up === true || p.ci?.conclusion === "success" || p.ciState === "SUCCESS" ? "ok" : "none";
}
/** CI chip: class suffix + label, from the Actions run or the raw rollup. */
export function ciOf(p: Project): { cls: string; label: string } | null {
  if (p.ci) return { cls: p.ci.conclusion ?? p.ci.status, label: p.ci.conclusion ?? p.ci.status };
  return ciFromState(p.ciState);
}
const ciRank = (p: Project) => (failing(p) ? 0 : ciOf(p)?.cls === "success" ? 3 : ciOf(p) ? 1 : 2);
const sRank: Record<RowState, number> = { attn: 0, wip: 1, none: 2, ok: 3 };
const lowFirst = (a: number | null | undefined, b: number | null | undefined) => (a ?? Infinity) - (b ?? Infinity) || 0; // unknown last
const cmp: Record<Sort, (a: Project, b: Project, bad: Set<string>) => number> = {
  active: (a, b) => feat(b) - feat(a) || pushed(b) - pushed(a), // featured first under the default sort
  stars: (a, b) => b.stars - a.stars,
  name: (a, b) => a.name.localeCompare(b.name),
  status: (a, b, bad) => sRank[rowState(a, bad)] - sRank[rowState(b, bad)],
  lang: (a, b) => (a.language ?? "￿").localeCompare(b.language ?? "￿"),
  ci: (a, b) => ciRank(a) - ciRank(b),
  uptime: (a, b) => lowFirst(a.url ? a.uptime30d : null, b.url ? b.uptime30d : null),
};
export function sortFilter(ps: Project[], sort: Sort, lang: string, status: StatusFilter, q = "", topic = "", bad: Set<string> = new Set(), stage: StageFilter = ""): Project[] {
  const needle = q.trim().toLowerCase();
  const hay = (p: Project) => [p.name, p.tagline, p.description, p.language, ...(p.topics ?? [])].join(" ").toLowerCase();
  const inState = (p: Project) => {
    const s = rowState(p, bad);
    return status === "all" || (status === "live" ? s === "ok" : status === "failing" ? s === "attn" : s === "wip" || s === "none");
  };
  return ps
    .filter((p) => (!lang || p.language === lang) && inState(p))
    .filter((p) => !topic || (p.topics ?? []).includes(topic))
    .filter((p) => !stage || (stage === "gaps" ? !!p.audit?.length : p.stage === stage))
    .filter((p) => !needle || hay(p).includes(needle))
    .sort((a, b) => cmp[sort](a, b, bad) || a.name.localeCompare(b.name));
}

/** The live-site status entry for a project (null without a site or without data). */
export const siteFor = (p: Project, st: Status | null | undefined) => (p.url ? (st?.sites.find((s) => s.repo === p.repo || s.name === p.name) ?? null) : null);

export type DayClass = "ok" | "warn" | "bad" | "none";
/** Uptime bar bucket for one day: >=99.9% ok, >=95% warn, below bad, no checks none. */
export function dayClass(d: { up: number; total: number }): { pct: number | null; cls: DayClass } {
  if (d.total <= 0) return { pct: null, cls: "none" };
  const pct = (d.up / d.total) * 100;
  return { pct, cls: pct >= 99.9 ? "ok" : pct >= 95 ? "warn" : "bad" };
}
/** "99.87%", floored so a near miss never rounds up to 100. */
export const fmtPct = (n: number) => `${Math.floor(n * 100 + 1e-9) / 100}%`;

/** Commits belonging to a project (API may give "owner/name" or the bare name), newest first. */
export const commitsFor = (p: Project, cs: Commit[]) =>
  cs.filter((c) => c.repo === p.repo || c.repo === p.name || p.repo.endsWith(`/${c.repo}`)).sort((a, b) => b.ts.localeCompare(a.ts));

export const firstLine = (s: string) => s.split("\n", 1)[0];

const PL = new Intl.PluralRules("en");
/** "1 star" / "7 stars" / "12,345 stars". */
export const plural = (n: number, word: string) => `${n.toLocaleString("en")} ${PL.select(n) === "one" ? word : `${word}s`}`;

/**
 * Fuzzy subsequence score of `q` in `text` (case-insensitive); null = no match.
 * Higher is better: prefix, word starts and consecutive letters score more.
 */
export function fuzzy(q: string, text: string): number | null {
  const a = q.trim().toLowerCase(), b = text.toLowerCase();
  if (!a) return 0;
  let score = 0, j = 0, run = 0;
  for (let i = 0; i < b.length && j < a.length; i++) {
    if (b[i] !== a[j]) { run = 0; continue; }
    run++;
    score += 1 + run * 2 + (i === 0 ? 8 : /[\s\-_/]/.test(b[i - 1]) ? 5 : 0);
    j++;
  }
  return j < a.length ? null : score - b.length * 0.01;
}
/** Items matching `q`, best first (stable for ties). */
export function rankBy<T>(items: T[], q: string, key: (t: T) => string): T[] {
  return items
    .map((t, i) => ({ t, i, s: fuzzy(q, key(t)) }))
    .filter((x): x is { t: T; i: number; s: number } => x.s !== null)
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map((x) => x.t);
}

/** Two colours for a generated cover tile: the project's top two language colours (strict #rrggbb or accent). */
export function tileColors(langs: { color: string | null }[] | undefined): [string, string] {
  const a = safeColor(langs?.[0]?.color);
  return [a, langs?.[1] ? safeColor(langs[1].color) : "var(--fx-2)"];
}
/** CSS background for a tile from `tileColors`. */
export const tileBackground = ([a, b]: [string, string]) =>
  `linear-gradient(135deg, color-mix(in srgb, ${a} 55%, var(--bg)), color-mix(in srgb, ${b} 30%, var(--bg)))`;
/** First letter or digit of a name, upper-cased; "?" when there is none. */
export const initialOf = (name: string) => (Array.from(name).find((c) => /[\p{L}\p{N}]/u.test(c)) ?? "?").toUpperCase();

export interface ReadmeBlock { kind: "p" | "li"; text: string }
const BULLET = /^(?:[-*•]|\d{1,3}[.)])\s+/;
/** Plain-text README excerpt -> one block per non-empty line; bullet/numbered lines become list items. Capped. */
export function readmeBlocks(text: string | null | undefined, max = 60): ReadmeBlock[] {
  const out: ReadmeBlock[] = [];
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) continue;
    out.push(BULLET.test(t) ? { kind: "li", text: t.replace(BULLET, "") } : { kind: "p", text: t });
    if (out.length >= max) break;
  }
  return out;
}
