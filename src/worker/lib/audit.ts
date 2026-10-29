// Repo hygiene audit (pure). Gap codes: readme, screenshot (from the README, stored by the detail pass) + about, website, topics (from the list pass, at read time).
import { readmeExcerpt } from "./github-parse";
import { websiteUrl } from "./site";

export type Gap = "readme" | "screenshot" | "about" | "website" | "topics";
export const GAPS: Gap[] = ["readme", "screenshot", "about", "website", "topics"];
const BADGE = /shields\.io|badgen\.net|badge\.svg|badge\.fury|\/actions\/workflows\/|codecov\.io|travis-ci|circleci\.com|coveralls\.io/i;

/** Image sources in README order: markdown `![](src)`, reference-free `<img src>`. */
export const readmeImages = (md: string): { src: string; alt: string }[] =>
  [...md.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map((m) => ({ src: (m[2] ?? m[3] ?? "").trim(), alt: (m[1] ?? /\balt\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1] ?? "").trim() }))
    .filter((x) => x.src && !BADGE.test(x.src));

export const IMAGE = /^[A-Za-z0-9._/-]{1,200}\.(png|jpe?g|webp|gif)$/i;
/** Repo-relative image path, or null (absolute URLs, `..`, odd characters, svg). */
export function relImage(src: string): string | null {
  const p = src.replace(/^\.\//, "").replace(/[?#].*$/, "");
  return IMAGE.test(p) && !p.startsWith("/") && !p.split("/").some((s) => s === ".." || s === ".") ? p : null;
}

/** Detail-pass gaps from the raw README (null = no README). */
export function readmeGaps(md: string | null | undefined): Gap[] {
  if (!md) return ["readme", "screenshot"];
  const g: Gap[] = [];
  if ((readmeExcerpt(md)?.length ?? 0) < 200) g.push("readme");
  if (!readmeImages(md).length) g.push("screenshot");
  return g;
}

/** All gaps for a row: stored README gaps + the list-pass fields. A repo whose README was never read counts as readme+screenshot gaps. */
export function gapsOf(p: { audit: string | null; description: string | null; homepage: string | null; topics: string[] }): Gap[] {
  let stored: Gap[] = ["readme", "screenshot"];
  try { const a = JSON.parse(p.audit ?? "null"); if (Array.isArray(a)) stored = a.filter((x): x is Gap => GAPS.includes(x)); } catch {}
  const g = new Set<Gap>(stored);
  if (!p.description?.trim()) g.add("about");
  if (!websiteUrl(p.homepage)) g.add("website");
  if (!p.topics.filter((t) => t !== "devpulse-ignore").length) g.add("topics");
  return GAPS.filter((x) => g.has(x));
}
