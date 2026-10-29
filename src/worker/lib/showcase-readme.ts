// README -> showcase sections (pure). Real repo text only: nothing is generated or invented; absent sections stay empty.
import { readmeImages, relImage } from "./audit";

export interface ReadmeShowcase {
  summary: string | null; highlights: string[];
  runThrough: { steps: string[]; commands: string[] };
  images: { path: string; alt: string }[];
}
export const EMPTY_SHOWCASE: ReadmeShowcase = { summary: null, highlights: [], runThrough: { steps: [], commands: [] }, images: [] };

export const README_MAX = 32 * 1024;
const HIGHLIGHT = /features|highlights|what it does|why|cool/i;
const RUN = /getting started|quick ?start|usage|how to (run|use)|install|run locally|walkthrough|how it works/i;
// eslint-disable-next-line no-control-regex
const BAD = /[\x00-\x08\x0B-\x1F\x7F‪-‮⁦-⁩]/g;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** One markdown line -> plain text (images, links, emphasis, code ticks and HTML removed). */
export function inline(l: string): string {
  return l.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)|!\[[^\]]*\]\[[^\]]*\]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/`+/g, "").replace(/\*\*|__|~~/g, "").replace(/(^|\s)[*_]+(?=\S)|(?<=\S)[*_]+(?=\s|$)/g, "$1")
    .replace(BAD, "").replace(/\s+/g, " ").trim();
}
const hasText = (s: string) => !!s && !/^[\s\p{P}\p{S}]*$/u.test(s);

interface Line { raw: string; level: number; heading: string | null; fence: boolean; inFence: boolean }
/** Tokenise: ATX + setext headings, fenced blocks (marker lines flagged `fence`, contents `inFence`). */
function lines(md: string): Line[] {
  const src = md.slice(0, README_MAX).replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
  const out: Line[] = [];
  let fence: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const raw = src[i];
    const f = /^\s*(```|~~~)/.exec(raw)?.[1];
    if (f && (!fence || fence === f)) { fence = fence ? null : f; out.push({ raw, level: 0, heading: null, fence: true, inFence: false }); continue; }
    if (fence) { out.push({ raw, level: 0, heading: null, fence: false, inFence: true }); continue; }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
    const setext = !h && raw.trim() && /^\s*(=+|-+)\s*$/.test(src[i + 1] ?? "") && !/^\s*([-*+]|\d+[.)])\s/.test(raw) ? (src[i + 1].trim()[0] === "=" ? 1 : 2) : 0;
    if (h || setext) { out.push({ raw, level: h ? h[1].length : setext, heading: inline(h ? h[2] : raw), fence: false, inFence: false }); if (setext) i++; continue; }
    out.push({ raw, level: 0, heading: null, fence: false, inFence: false });
  }
  return out;
}

/** Lines under the first heading matching `re`, up to the next heading of the same or higher level. */
function section(ls: Line[], re: RegExp): Line[] | null {
  const i = ls.findIndex((l) => l.heading != null && re.test(l.heading));
  if (i < 0) return null;
  const end = ls.findIndex((l, j) => j > i && l.heading != null && l.level <= ls[i].level);
  return ls.slice(i + 1, end < 0 ? undefined : end);
}

const BULLET = /^(\s{0,3})(?:[-*+]|\d+[.)])\s+(.*)$/;
const bullets = (ls: Line[], max: number, n: number) =>
  ls.flatMap((l) => { if (l.inFence || l.fence || l.heading != null) return []; const b = BULLET.exec(l.raw); const t = b ? inline(b[2]) : ""; return hasText(t) ? [clip(t, n)] : []; }).slice(0, max);

/** First run of consecutive bullet lines in the document. */
function firstList(ls: Line[]): Line[] {
  const i = ls.findIndex((l) => !l.inFence && !l.fence && l.heading == null && BULLET.test(l.raw));
  if (i < 0) return [];
  let j = i;
  while (j < ls.length && !ls[j].inFence && ls[j].heading == null && (BULLET.test(ls[j].raw) || /^\s{2,}\S/.test(ls[j].raw))) j++;
  return ls.slice(i, j);
}

/** Prose paragraphs (no bullets, tables, quotes-of-badges) before the first level-2 heading, else anywhere; <= 2 paragraphs, 600 chars. */
function summary(ls: Line[]): string | null {
  const collect = (part: Line[]) => {
    const paras: string[] = []; let cur: string[] = [];
    const flush = () => { if (cur.length) { paras.push(cur.join(" ")); cur = []; } };
    for (const l of part) {
      if (paras.length >= 2) break;
      if (l.fence || l.inFence || l.heading != null || !l.raw.trim() || BULLET.test(l.raw) || /^\s*\|/.test(l.raw) || /^\s*([=-]{3,}|[*_]{3,})\s*$/.test(l.raw)) { flush(); continue; }
      const t = inline(l.raw.replace(/^\s*>\s?/, ""));
      if (hasText(t)) cur.push(t); else flush();
    }
    flush();
    return paras.slice(0, 2).join("\n\n");
  };
  const h2 = ls.findIndex((l) => l.heading != null && l.level >= 2);
  const s = collect(h2 < 0 ? ls : ls.slice(0, h2)) || collect(ls);
  return s ? clip(s, 600) : null;
}

export function parseReadmeShowcase(md: string | null | undefined): ReadmeShowcase {
  if (!md) return EMPTY_SHOWCASE;
  const ls = lines(md);
  const hl = section(ls, HIGHLIGHT);
  const run = section(ls, RUN) ?? [];
  const fi = run.findIndex((l) => l.fence);
  const fe = fi < 0 ? -1 : run.findIndex((l, j) => j > fi && l.fence);
  const commands = fi < 0 ? [] : run.slice(fi + 1, fe < 0 ? undefined : fe).map((l) => l.raw.replace(BAD, "").replace(/^\s*\$\s+/, "").trimEnd()).filter((l) => l.trim()).slice(0, 6).map((l) => clip(l, 120));
  const seen = new Set<string>();
  const images = readmeImages(md.slice(0, README_MAX)).flatMap((x) => { const path = relImage(x.src); return path && !seen.has(path) ? (seen.add(path), [{ path, alt: clip(inline(x.alt), 120) }]) : []; }).slice(0, 6);
  return {
    summary: summary(ls),
    highlights: bullets(hl && bullets(hl, 8, 160).length ? hl : firstList(ls), 8, 160),
    runThrough: { steps: bullets(run, 8, 160), commands },
    images,
  };
}

/** Stored JSON -> a valid shape (never throws). */
export function readShowcase(j: string | null | undefined): ReadmeShowcase {
  try {
    const o = JSON.parse(j ?? "null") as Partial<ReadmeShowcase> | null;
    if (!o || typeof o !== "object") return EMPTY_SHOWCASE;
    const strs = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : []);
    return {
      summary: typeof o.summary === "string" ? o.summary : null, highlights: strs(o.highlights),
      runThrough: { steps: strs(o.runThrough?.steps), commands: strs(o.runThrough?.commands) },
      images: Array.isArray(o.images) ? o.images.filter((x) => typeof x?.path === "string" && relImage(x.path)).map((x) => ({ path: x.path, alt: typeof x.alt === "string" ? x.alt : "" })) : [],
    };
  } catch { return EMPTY_SHOWCASE; }
}
