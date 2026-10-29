// Live-site discovery (pure, no I/O). Order: Website field > .devpulse.json `site` > package.json `homepage` > wrangler config > README link > GitHub Pages.
// Only the Website field is trusted as is; every other candidate must pass one probe (sites.ts) before it becomes `projects.url`.

export type SiteSrc = "website" | "devpulse" | "package" | "wrangler" | "readme" | "pages";
export interface Cand { src: Exclude<SiteSrc, "website">; url: string }

const GITHUB = new Set(["github.com", "www.github.com"]);
// Probe/screenshot targets come from repo content: public DNS names only (no IP literals, localhost or internal suffixes).
const PRIVATE_HOST = /^\[|^\d{1,3}(\.\d{1,3}){3}$|(^|\.)(localhost|local|internal|intranet|lan|home\.arpa|in-addr\.arpa|ip6\.arpa)$/i;

/** https, no credentials, <= 300 chars, not a github.com page (a repo link is not a live site). Returns the trimmed URL or null. */
export function cleanUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const s = u.trim();
  if (!s || s.length > 300 || /[\s\x00-\x1F\x7F]/.test(s)) return null;
  try {
    const x = new URL(s);
    return x.protocol === "https:" && !x.username && !x.password && x.hostname.includes(".") && !PRIVATE_HOST.test(x.hostname.replace(/\.$/, "")) && !GITHUB.has(x.hostname.toLowerCase()) ? s : null;
  } catch { return null; }
}

/** The GitHub "Website" field, if it is a usable live site. */
export const websiteUrl = (homepage: string | null | undefined): string | null => cleanUrl(homepage);

/** JSONC -> JSON text: drops // and /* *\/ comments outside strings, then trailing commas. */
export function stripJsonc(t: string): string {
  let out = "", i = 0, str = false;
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (str) { out += c; if (c === "\\") { out += n ?? ""; i += 2; continue; } if (c === '"') str = false; i++; continue; }
    if (c === '"') { str = true; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < t.length && t[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { const e = t.indexOf("*/", i + 2); i = e < 0 ? t.length : e + 2; continue; }
    out += c; i++;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

interface Wrangler { name?: unknown; main?: unknown; assets?: unknown; pages_build_output_dir?: unknown; workers_dev?: unknown; routes?: unknown; route?: unknown }
const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/i;
const host = (p: string) => cleanUrl(`https://${p.replace(/^https?:\/\//, "").replace(/\/\*?$/, "")}`);

/** Live URLs a wrangler config declares: custom domains first, then <name>.pages.dev (Pages) or <name>.<sub>.workers.dev (Worker). */
export function wranglerUrls(w: Wrangler | null, workersSub?: string): string[] {
  if (!w || typeof w !== "object") return [];
  const out: string[] = [];
  for (const r of [w.routes, w.route].flat()) {
    const o = r as { pattern?: unknown; custom_domain?: unknown } | null;
    if (o && typeof o === "object" && o.custom_domain === true && typeof o.pattern === "string") { const u = host(o.pattern); if (u) out.push(u); }
  }
  const name = typeof w.name === "string" && NAME.test(w.name) ? w.name.toLowerCase() : null;
  if (name && typeof w.pages_build_output_dir === "string") out.push(`https://${name}.pages.dev`);
  else if (name && (w.main || w.assets) && w.workers_dev !== false && workersSub && NAME.test(workersSub)) out.push(`https://${name}.${workersSub.toLowerCase()}.workers.dev`);
  return out;
}

/** wrangler.jsonc / wrangler.json text -> config, or null. */
export function parseWranglerJson(t: string | null | undefined): Wrangler | null {
  if (!t) return null;
  try { const j = JSON.parse(stripJsonc(t)); return j && typeof j === "object" && !Array.isArray(j) ? j : null; } catch { return null; }
}

/** wrangler.toml -> the few top-level keys discovery needs (simple line regexes; tables after the first [section] are ignored except [assets] and routes). */
export function parseWranglerToml(t: string | null | undefined): Wrangler | null {
  if (!t) return null;
  const top = t.split(/^\s*\[/m)[0];
  const str = (k: string) => new RegExp(`^\\s*${k}\\s*=\\s*["']([^"']+)["']`, "m").exec(top)?.[1];
  const routes = [...t.matchAll(/pattern\s*=\s*["']([^"']+)["'][^}\n]*custom_domain\s*=\s*true/g)].map((m) => ({ pattern: m[1], custom_domain: true }));
  return {
    name: str("name"), main: str("main"), pages_build_output_dir: str("pages_build_output_dir"),
    workers_dev: /^\s*workers_dev\s*=\s*false/m.test(top) ? false : undefined, assets: /^\s*\[assets\]/m.test(t) || undefined, routes,
  };
}

/** package.json `homepage`, if it is a live site. */
export function packageHomepage(t: string | null | undefined): string | null {
  if (!t) return null;
  try { return cleanUrl((JSON.parse(t) as { homepage?: unknown } | null)?.homepage); } catch { return null; }
}

/** First README link to a *.pages.dev / *.workers.dev host or this repo's <owner>.github.io/<repo> page. */
export function readmeSite(md: string | null | undefined, owner: string, repo: string): string | null {
  if (!md) return null;
  for (const m of md.slice(0, 64 * 1024).matchAll(/https:\/\/[^\s)<>"'`\]*]+/g)) {
    const u = cleanUrl(m[0].replace(/[.,;:!?]+$/, ""));
    if (!u) continue;
    const x = new URL(u), h = x.hostname.toLowerCase();
    if (h.endsWith(".pages.dev") || h.endsWith(".workers.dev")) return u;
    if (h === `${owner.toLowerCase()}.github.io` && x.pathname.toLowerCase().replace(/\/$/, "").split("/")[1] === repo.toLowerCase()) return u;
  }
  return null;
}

export interface SiteInput {
  owner: string; name: string; devpulseSite: string | null; pkg?: string | null;
  wranglerJsonc?: string | null; wranglerJson?: string | null; wranglerToml?: string | null; readme?: string | null; workersSub?: string;
}

/** Ordered, de-duplicated probe candidates (everything but the Website field). The GitHub Pages guess is always last. */
export function siteCandidates(i: SiteInput): Cand[] {
  const w = parseWranglerJson(i.wranglerJsonc) ?? parseWranglerJson(i.wranglerJson) ?? parseWranglerToml(i.wranglerToml);
  const all: Cand[] = [
    ...(i.devpulseSite ? [{ src: "devpulse" as const, url: i.devpulseSite }] : []),
    ...[packageHomepage(i.pkg)].flatMap((url) => (url ? [{ src: "package" as const, url }] : [])),
    ...wranglerUrls(w, i.workersSub).map((url) => ({ src: "wrangler" as const, url })),
    ...[readmeSite(i.readme, i.owner, i.name)].flatMap((url) => (url ? [{ src: "readme" as const, url }] : [])),
    ...(NAME.test(i.owner) && /^[A-Za-z0-9._-]{1,100}$/.test(i.name) ? [{ src: "pages" as const, url: `https://${i.owner.toLowerCase()}.github.io/${i.name}/` }] : []),
  ];
  const seen = new Set<string>();
  return all.filter((c) => { const k = c.url.toLowerCase().replace(/\/$/, ""); return seen.has(k) ? false : (seen.add(k), true); }).slice(0, 6);
}

/** Probe state machine: which candidate to try next, or null when nothing is due. See README "Live site discovery". */
export function nextProbe(cands: Cand[], probeUrl: string | null, probeOk: number | null, probeAt: number | null, now: number, retryS: number): Cand | null {
  if (!cands.length) return null;
  if (probeAt == null || probeUrl == null) return cands[0];
  if (probeOk === 1) return null; // verified; a candidate change (detail pass) resets the state
  const j = cands.findIndex((c) => c.url === probeUrl);
  if (j >= 0 && j < cands.length - 1) return cands[j + 1]; // fall through to the next candidate right away
  return now - probeAt >= retryS ? cands[0] : null; // whole list failed: start over after the retry window
}
