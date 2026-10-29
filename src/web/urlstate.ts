import { STAGES } from "./api";
import type { Sort, StageFilter, StatusFilter } from "./hubutil";

export interface UrlState { q: string; sort: Sort; lang: string; status: StatusFilter; topic: string; stage: StageFilter; p: string }
const SORTS: Sort[] = ["active", "stars", "name", "status", "lang", "ci", "uptime"];
const STATUSES: StatusFilter[] = ["all", "live", "failing", "wip"];
const LEGACY_STATUS: Record<string, StatusFilter> = { up: "live", down: "failing" }; // old ?status=up|down links
export const DEFAULT_VIEW: Omit<UrlState, "p"> = { q: "", sort: "active", lang: "", status: "all", topic: "", stage: "" };
const STAGE_FILTERS: string[] = ["", "gaps", ...STAGES];

const dec = (s: string) => {
  try { return decodeURIComponent(s); } catch { return ""; }
};

/** Parse `?q=&sort=&lang=&status=&topic=` and the legacy `#p/<name>` hash; invalid values fall back to defaults. */
export function parseUrl(search: string, hash: string): UrlState {
  const u = new URLSearchParams(search);
  const sort = u.get("sort") as Sort, raw = u.get("status") ?? "", status = (LEGACY_STATUS[raw] ?? raw) as StatusFilter;
  return {
    q: (u.get("q") ?? "").slice(0, 100),
    sort: SORTS.includes(sort) ? sort : "active",
    lang: (u.get("lang") ?? "").slice(0, 60),
    status: STATUSES.includes(status) ? status : "all",
    topic: (u.get("topic") ?? "").slice(0, 60),
    stage: (STAGE_FILTERS.includes(u.get("stage") ?? "") ? u.get("stage") ?? "" : "") as StageFilter,
    p: hash.startsWith("#p/") ? dec(hash.slice(3)).slice(0, 120) : "",
  };
}
/** "?a=b" for the non-default filters, "" when all default. */
export function toSearch(s: Omit<UrlState, "p">): string {
  const u = new URLSearchParams();
  if (s.q) u.set("q", s.q);
  if (s.sort !== "active") u.set("sort", s.sort);
  if (s.lang) u.set("lang", s.lang);
  if (s.status !== "all") u.set("status", s.status);
  if (s.topic) u.set("topic", s.topic);
  if (s.stage) u.set("stage", s.stage);
  const str = u.toString();
  return str ? `?${str}` : "";
}
/** "#p/<name>" or "". */
export const toHash = (name: string) => (name ? `#p/${encodeURIComponent(name)}` : "");

/** "/p/<name>" -> decoded name; null for any other path (the list view). */
export function parseProjectPath(pathname: string): string | null {
  const m = /^\/p\/([^/]+)\/?$/.exec(pathname);
  return m ? dec(m[1]).slice(0, 120) || null : null;
}
export const toProjectPath = (name: string) => `/p/${encodeURIComponent(name)}`;

/** Developer (default, the health dashboard) or Showcase (project gallery). */
export type Mode = "dev" | "showcase";
/** `?mode=showcase|dev` -> the mode, or null when the URL does not say (the stored choice applies). */
export function parseMode(search: string): Mode | null {
  const m = new URLSearchParams(search).get("mode");
  return m === "showcase" || m === "dev" ? m : null;
}
/** `search` with the mode param set (showcase) or removed (dev, the default). Other params keep their order. */
export function withMode(search: string, mode: Mode): string {
  const u = new URLSearchParams(search);
  u.delete("mode");
  if (mode === "showcase") u.set("mode", "showcase");
  const str = u.toString();
  return str ? `?${str}` : "";
}
