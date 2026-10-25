import "./ledger.css";
import { add, el, link, NODATA, type Project } from "./api";
import { ciOf, initialOf, safeColor, tileBackground, tileColors } from "./hubutil";
import { navLink } from "./nav";
import { toProjectPath } from "./urlstate";

/** Generated cover: gradient from the project's language colours + its initial. Decorative. */
export function tile(p: Project, size: "lg" | "sm") {
  const t = el("div", "", `sc-media sc-tile sc-media--${size}`, { "aria-hidden": "true" });
  t.style.background = tileBackground(tileColors(p.languages));
  add(t, el("span", initialOf(p.name), "sc-initial"));
  return t;
}

/** Same-origin cover image with reserved size, or the tile when there is none / it fails to load. */
export function cover(p: Project, size: "lg" | "sm"): HTMLElement {
  if (!p.cover?.startsWith("/img/")) return tile(p, size);
  const [w, h] = size === "lg" ? [1200, 630] : [320, 140];
  const img = el("img", "", `sc-media sc-media--${size}`, { src: p.cover, alt: "", width: String(w), height: String(h), loading: "lazy", decoding: "async" });
  img.addEventListener("error", () => img.replaceWith(tile(p, size)), { once: true });
  // The Worker answers a missing cover with a 404 SVG placeholder (intrinsic 40x21), which browsers still render: swap it for the tile too.
  img.addEventListener("load", () => { if (img.naturalWidth === 40 && img.naturalHeight === 21) img.replaceWith(tile(p, size)); });
  return img;
}

export function langBar(p: Project) {
  const bar = el("div", "", "hub-langbar", { role: "img", "aria-label": `Languages: ${p.languages.map((l) => `${l.lang} ${Math.round(l.pct)}%`).join(", ")}` });
  for (const l of p.languages) {
    const seg = el("span");
    seg.style.width = `${Math.max(0, l.pct)}%`;
    seg.style.background = safeColor(l.color);
    add(bar, seg);
  }
  return bar;
}

/** Up/Down + CI at a glance (glyph + text, never colour alone). */
export function pills(p: Project) {
  const row = el("div", "", "sc-pills");
  if (!p.url) add(row, el("span", "No live site", "dp-status", { "data-s": "none" }));
  else add(row, p.up === null ? el("span", NODATA, "dp-status", { "data-s": "none" }) : el("span", p.up ? "Up" : "Down", "dp-status", { "data-s": p.up ? "ok" : "attn" }));
  const st = ciOf(p);
  if (st) add(row, el("span", `CI: ${st.label}`, `hs-chip ci ci--${st.cls}`));
  return row;
}

export const viewLink = (p: Project) => {
  const a = navLink("View project", toProjectPath(p.name), "hs-btn hub-btn", `View project ${p.name}`);
  a.dataset.vp = p.name;
  return a;
};

export function actions(p: Project, view: boolean) {
  const acts = el("div", "", "hub-actions");
  if (view) add(acts, viewLink(p));
  if (p.url) add(acts, link("Live", p.url, "hs-btn hub-btn hub-btn--alt"));
  add(acts, link("Repo", `https://github.com/${p.repo}`, "hs-btn hub-btn hub-btn--alt"));
  return acts;
}

export function featuredCard(p: Project) {
  const c = el("article", "", "sc-card");
  const b = el("div", "", "sc-body");
  add(b, el("h3", p.name), pills(p));
  const blurb = p.tagline ?? p.description;
  if (blurb) add(b, el("p", blurb, "hub-desc"));
  if (p.languages?.length) {
    const ul = el("ul", "", "hub-langs", { "aria-label": "Languages" });
    for (const l of p.languages.slice(0, 4)) {
      const li = el("li");
      const dot = el("i", "", "hub-dot", { "aria-hidden": "true" });
      dot.style.background = safeColor(l.color);
      add(li, dot, l.lang);
      add(ul, li);
    }
    add(b, ul);
  }
  add(b, actions(p, true));
  add(c, cover(p, "lg"), b);
  return c;
}
