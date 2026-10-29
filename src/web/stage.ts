// Stage chip, freshness line, stale marker, repo-gaps indicator: shared by the ledger, the detail view and the showcase.
import { add, el, GAP_LABEL, STAGE_LABEL, staleText, type Project } from "./api";
import { relTime } from "./hubutil";

/** Glyph + text (never colour alone). Null when the API has no stage (older cached response). */
export function stageChip(p: Project) {
  if (!p.stage) return null;
  return el("span", STAGE_LABEL[p.stage] ?? p.stage, "stg", { "data-stage": p.stage });
}

/** "checked 5 min. ago" from the last repo-list pass; "" when unknown. */
export const checkedText = (p: Project, now = Date.now()) => (p.checkedAt ? `checked ${relTime(p.checkedAt, now)}` : "");

/** Visible "stale" marker; the reason in the title and in screen-reader text. Null when fresh. */
export function staleMark(p: Project) {
  if (!p.stale) return null;
  const why = staleText(p.staleWhy);
  const s = el("span", "stale", "stalemark", { title: why ? `Stale: ${why}` : "Stale" });
  if (why) add(s, el("span", `: ${why}`, "sr-only"));
  return s;
}

/** "2 gaps" chip with the list as text for assistive tech and a tooltip. Null when nothing is missing. */
export function gapsMark(p: Project) {
  const g = p.audit ?? [];
  if (!g.length) return null;
  const names = g.map((x) => GAP_LABEL[x] ?? x).join(", ");
  const s = el("span", `${g.length} ${g.length === 1 ? "gap" : "gaps"}`, "gapmark", { title: `Missing: ${names}` });
  add(s, el("span", `, missing: ${names}`, "sr-only"));
  return s;
}

/** One row of the ledger's meta line: stage, stale, gaps (only those with data). */
export function metaLine(p: Project) {
  const parts = [stageChip(p), staleMark(p), gapsMark(p)].filter((x): x is HTMLElement => !!x);
  if (!parts.length) return null;
  const d = el("span", "", "lg-meta");
  add(d, ...parts);
  return d;
}
