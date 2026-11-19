// Project Hub sorting and filtering (pure, no DOM): what kind a project is, search, order, spotlight, related projects.
import { sameOriginImg, type Project } from "../api";

export type Kind = "web" | "ext" | "lib" | "exp";
export const KINDS: { k: Kind | ""; label: string }[] = [
  { k: "", label: "All" }, { k: "web", label: "Web apps" }, { k: "ext", label: "Extensions" }, { k: "lib", label: "Libraries & tools" }, { k: "exp", label: "Experiments" },
];
export const KIND_TAG: Record<Kind, string> = { web: "Web app", ext: "Browser extension", lib: "Library or tool", exp: "Experiment" };
const EXT = /^(chrome|browser)-extension$|^firefox-addon$|^web-extension$/;
const LIB = /^(library|lib|cli|npm|npm-package|package|sdk|engine|framework|tool|tools|command-line|parser|compiler)$/;

/** Extension first (its Website may be a store page), then anything with a live URL, then libraries/tools by topic, else an experiment. */
export function kindOf(p: Pick<Project, "url" | "stage" | "topics">): Kind {
  const t = p.topics ?? [];
  if (p.stage === "released-extension" || t.some((x) => EXT.test(x))) return "ext";
  if (p.url) return "web";
  return t.some((x) => LIB.test(x)) ? "lib" : "exp";
}
export const isKind = (s: string | null): s is Kind => s === "web" || s === "ext" || s === "lib" || s === "exp";

/** The README's own title ("LLM Microscope") when it has one, else the repo name. */
export const titleOf = (p: Pick<Project, "name" | "showcase">) => p.showcase?.title?.trim() || p.name;

/** First sentence of a summary, <= max chars, cut at a sentence end, else a word boundary (with "…"). Same rule as the Worker's. */
export function firstSentence(text: string | null | undefined, max = 160): string | null {
  const t = (text ?? "").split(/\n{2,}/)[0].replace(/\s+/g, " ").trim();
  if (!t) return null;
  const m = /^(.+?[.!?])(\s|$)/.exec(t);
  const s = m ? m[1] : t;
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1), sp = cut.lastIndexOf(" ");
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:.!?-]+$/, "") + "…";
}
/** One-line pitch: tagline, else the GitHub description, else the README summary's first sentence. */
export const pitchOf = (p: Pick<Project, "tagline" | "description" | "showcase">) => p.tagline || p.description || firstSentence(p.showcase?.summary) || null;

/** A real picture exists: live snapshot, declared cover or a README screenshot. */
export const hasPicture = (p: Pick<Project, "shot" | "cover" | "showcase">) => !!(sameOriginImg(p.shot) ?? sameOriginImg(p.cover) ?? sameOriginImg(p.showcase?.images?.[0]?.url));

const pushed = (p: Pick<Project, "pushedAt">) => (p.pushedAt ? Date.parse(p.pushedAt) || 0 : 0);
const byName = (a: Pick<Project, "name" | "showcase">, b: Pick<Project, "name" | "showcase">) => titleOf(a).localeCompare(titleOf(b), "en", { sensitivity: "base" });
/** Featured first, then the most recent push, then name. */
export const galleryOrder = <T extends Pick<Project, "featured" | "pushedAt" | "name" | "showcase">>(ps: T[]) =>
  [...ps].sort((a, b) => Number(b.featured) - Number(a.featured) || pushed(b) - pushed(a) || byName(a, b));

export type Order = "recent" | "az";
export const sortBy = <T extends Pick<Project, "pushedAt" | "name" | "showcase">>(ps: T[], o: Order) =>
  [...ps].sort(o === "az" ? byName : (a, b) => pushed(b) - pushed(a) || byName(a, b));

/** Every word of the query must appear in the name, tagline, description, topics or language names (case-insensitive). */
export function matches(p: Project, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [p.name, p.showcase?.title, p.tagline, p.description, ...(p.topics ?? []), ...(p.languages ?? []).map((l) => l.lang), KIND_TAG[kindOf(p)]]
    .filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** How well a project shows off: a real picture first (strongly), then highlights, summary length, a live site. */
export function showcaseScore(p: Project): number {
  return (hasPicture(p) ? 1000 : 0) + Math.min(p.showcase?.highlights?.length ?? 0, 8) * 10 + Math.min((p.showcase?.summary?.length ?? 0) / 60, 10) + (p.url ? 5 : 0);
}
/**
 * Spotlight (max 3): the featured projects; else the best-showcased ones (score, then newest push).
 * A project without a picture is never spotlit while at least three with pictures exist.
 */
export function spotlight(ps: Project[]): Project[] {
  const live = ps.filter((p) => !p.archived);
  const feat = galleryOrder(live.filter((p) => p.featured));
  if (feat.length) return feat.slice(0, 3);
  const pics = live.filter(hasPicture);
  const pool = pics.length >= 3 ? pics : live;
  return [...pool].sort((a, b) => showcaseScore(b) - showcaseScore(a) || pushed(b) - pushed(a) || byName(a, b)).slice(0, 3);
}

/** Up to n projects like p: same kind first, then sharing its main language; newest first. */
export function related(p: Project, all: Project[], exclude: string[] = [], n = 3): Project[] {
  const k = kindOf(p), lang = p.languages?.[0]?.lang;
  const pool = sortBy(all.filter((x) => !x.archived && x.name !== p.name && !exclude.includes(x.name)), "recent");
  const same = pool.filter((x) => kindOf(x) === k);
  const lng = lang ? pool.filter((x) => kindOf(x) !== k && x.languages?.[0]?.lang === lang) : [];
  return [...same, ...lng].slice(0, n);
}

/** Previous / next project in gallery order (wrapping), or null when there is no other project. */
export function neighbours(p: Project, all: Project[]): { prev: Project; next: Project } | null {
  const list = galleryOrder(all.filter((x) => !x.archived || x.name === p.name));
  const i = list.findIndex((x) => x.name === p.name);
  if (i < 0 || list.length < 2) return null;
  return { prev: list[(i - 1 + list.length) % list.length], next: list[(i + 1) % list.length] };
}

/** "Label: text" highlight -> { label, text }; plain bullets have no label. */
export function splitHighlight(h: string): { label: string | null; text: string } {
  const m = /^([^:.!?]{2,40}):\s+(\S.*)$/.exec(h.trim());
  return m ? { label: m[1].trim(), text: m[2].trim() } : { label: null, text: h.trim() };
}

/** A store or release link for an extension: a declared Chrome/Edge/Firefox store link, else the latest GitHub release. */
const STORE = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons|addons\.mozilla\.org)\//;
export function getIt(p: Project): { label: string; url: string } | null {
  if (kindOf(p) !== "ext") return null;
  const store = [p.url, ...(p.links ?? []).map((l) => l.url)].find((u) => u && STORE.test(u));
  if (store) return { label: "Get the extension", url: store };
  if (p.release) return { label: "Download the latest release", url: `https://github.com/${p.repo}/releases/latest` };
  return null;
}
