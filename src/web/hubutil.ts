import type { Commit, Project } from "./api";

export type Sort = "active" | "stars" | "name" | "status";
export type StatusFilter = "all" | "up" | "down";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60],
];
/** "3 days ago" from an ISO timestamp; "" when missing/invalid. */
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
const rank = (p: Project) => (p.up === false ? 0 : p.up === true ? 1 : 2); // down first: needs attention
const cmp: Record<Sort, (a: Project, b: Project) => number> = {
  active: (a, b) => pushed(b) - pushed(a),
  stars: (a, b) => b.stars - a.stars,
  name: (a, b) => a.name.localeCompare(b.name),
  status: (a, b) => rank(a) - rank(b),
};
export function sortFilter(ps: Project[], sort: Sort, lang: string, status: StatusFilter): Project[] {
  return ps
    .filter((p) => (!lang || p.language === lang) && (status === "all" || p.up === (status === "up")))
    .sort((a, b) => cmp[sort](a, b) || a.name.localeCompare(b.name));
}

/** Commits belonging to a project (API may give "owner/name" or the bare name), newest first. */
export const commitsFor = (p: Project, cs: Commit[]) =>
  cs.filter((c) => c.repo === p.repo || c.repo === p.name || p.repo.endsWith(`/${c.repo}`)).sort((a, b) => b.ts.localeCompare(a.ts));

export const firstLine = (s: string) => s.split("\n", 1)[0];
