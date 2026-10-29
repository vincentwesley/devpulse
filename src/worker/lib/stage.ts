// Derived project stage + staleness (pure). Rules are documented in README "Stages"; first match wins.
import { DETAIL_MIN_GAP_S } from "../config";

export type Stage = "archived" | "live-down" | "live-up" | "live-pending" | "released-extension" | "active" | "quiet";
export const STAGES: Stage[] = ["archived", "live-down", "live-up", "live-pending", "released-extension", "active", "quiet"];
export const QUIET_DAYS = 30;
const EXT_TOPICS = new Set(["chrome-extension", "browser-extension", "firefox-addon"]);

export interface StageIn { archived: boolean; url: string | null; up: boolean | null; incidentOpen: boolean; topics: string[]; kind: string | null; release: boolean; pushedAt: string | null }

export const isExtension = (p: Pick<StageIn, "topics" | "kind">) => p.kind === "extension" || p.topics.some((t) => EXT_TOPICS.has(t));

export function stageOf(p: StageIn, now = Date.now()): Stage {
  if (p.archived) return "archived";
  if (p.url) return p.up === false || p.incidentOpen ? "live-down" : p.up ? "live-up" : "live-pending";
  if (isExtension(p) && p.release) return "released-extension";
  const pushed = p.pushedAt ? Date.parse(p.pushedAt) : NaN;
  return Number.isFinite(pushed) && now - pushed < QUIET_DAYS * 864e5 ? "active" : "quiet";
}

export const LIST_STALE_S = 45 * 60, DETAIL_STALE_S = 2 * 3600;

export interface StaleIn { listAt: string | null; url: string | null; uptimeAt: number | null; sitesPerCycle: number; pushedAt: string | null; updatedAt: string | null; detailAt: string | null }

/** Why a row's data may be old: list (GitHub list pass), uptime (site check), detail (README/config pass pending). */
export function staleOf(p: StaleIn, now = Date.now()): { stale: boolean; why: ("list" | "uptime" | "detail")[] } {
  const why: ("list" | "uptime" | "detail")[] = [];
  const list = p.listAt ? Date.parse(p.listAt) : NaN;
  if (!Number.isFinite(list) || now - list > LIST_STALE_S * 1000) why.push("list");
  // uptime_summary.updated_at is unix seconds; >30 sites rotate, so the allowance grows with the rotation factor.
  if (p.url && (p.uptimeAt == null || now / 1000 - p.uptimeAt > LIST_STALE_S * Math.max(1, p.sitesPerCycle))) why.push("uptime");
  // Detail refresh is at most daily per repo (DETAIL_MIN_GAP_S), so a pending change only counts once it is 2 h past its allowed slot.
  const changed = [p.pushedAt, p.updatedAt].filter((x): x is string => !!x).sort().pop() ?? null;
  const due = !p.detailAt ? (changed ? Date.parse(changed) : NaN) : Math.max(Date.parse(changed ?? ""), Date.parse(p.detailAt) + DETAIL_MIN_GAP_S * 1000);
  if (changed && (!p.detailAt || changed > p.detailAt) && now - due > DETAIL_STALE_S * 1000) why.push("detail");
  return { stale: why.length > 0, why };
}
