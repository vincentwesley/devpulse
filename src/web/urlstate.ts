import type { Sort, StatusFilter } from "./hubutil";

export interface UrlState { q: string; sort: Sort; lang: string; status: StatusFilter; topic: string; p: string }
const SORTS: Sort[] = ["active", "stars", "name", "status"];
const STATUSES: StatusFilter[] = ["all", "up", "down"];
export const DEFAULT_VIEW: Omit<UrlState, "p"> = { q: "", sort: "active", lang: "", status: "all", topic: "" };

const dec = (s: string) => {
  try { return decodeURIComponent(s); } catch { return ""; }
};

/** Parse `?q=&sort=&lang=&status=&topic=` and `#p/<name>`; invalid values fall back to defaults. */
export function parseUrl(search: string, hash: string): UrlState {
  const u = new URLSearchParams(search);
  const sort = u.get("sort") as Sort, status = u.get("status") as StatusFilter;
  return {
    q: (u.get("q") ?? "").slice(0, 100),
    sort: SORTS.includes(sort) ? sort : "active",
    lang: (u.get("lang") ?? "").slice(0, 60),
    status: STATUSES.includes(status) ? status : "all",
    topic: (u.get("topic") ?? "").slice(0, 60),
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
