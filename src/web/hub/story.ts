// Project story page (/p/<name>), laid out like a short case study / store page: outcome-first hero with the ways in and a small
// info strip, a picture gallery, then the same sections in the same order for every project (Overview, Highlights, How to try it,
// Built with), an on-page index on wide screens, and previous / next / related projects at the end.
// Real repo content only (README sections, description, topics, languages, release); a section without data is left out.
import { add, el, fmtDate, link, sameOriginImg, type Project } from "../api";
import { readmeBlocks } from "../hubutil";
import { toProjectPath } from "../urlstate";
import { grid, heading, kindLabel, media, storyLink, updated } from "./hub";
import { getIt, KIND_TAG, kindOf, neighbours, pitchOf, related, splitHighlight, titleOf } from "./kind";

let lbx: HTMLDialogElement | null = null;
/** Picture viewer: native <dialog> (Esc closes, focus stays inside), arrow keys page, focus returns to the opener. */
function lightbox(imgs: { url: string; alt: string }[], start: number, opener: HTMLElement) {
  lbx?.remove();
  const d = el("dialog", "", "lbx", { "aria-label": "Picture viewer" });
  const fig = el("figure", "", "lbx__fig");
  const img = el("img", "", "lbx__img", { width: "1280", height: "800", alt: "" });
  const cap = el("figcaption", "", "lbx__cap");
  const pos = el("p", "", "lbx__pos", { "aria-live": "polite" });
  const prev = el("button", "Previous", "hs-btn hb-btn hb-btn--alt", { type: "button" });
  const next = el("button", "Next", "hs-btn hb-btn hb-btn--alt", { type: "button" });
  const close = el("button", "Close", "hs-btn hb-btn lbx__close", { type: "button" });
  let i = start;
  const go = (n: number) => {
    i = (n + imgs.length) % imgs.length;
    img.src = imgs[i].url;
    img.alt = imgs[i].alt;
    cap.textContent = imgs[i].alt;
    pos.textContent = `${i + 1} of ${imgs.length}`;
  };
  prev.addEventListener("click", () => go(i - 1));
  next.addEventListener("click", () => go(i + 1));
  close.addEventListener("click", () => d.close());
  d.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
  });
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); }); // backdrop
  d.addEventListener("close", () => { d.remove(); lbx = null; opener.focus(); });
  const nav = el("div", "", "lbx__nav");
  if (imgs.length > 1) add(nav, prev, next);
  add(nav, close);
  add(fig, img, cap);
  add(d, fig, pos, nav);
  document.body.appendChild(d);
  lbx = d;
  go(start);
  d.showModal();
  close.focus();
}

/** Commands in a <pre> with a Copy button; if the clipboard is blocked the text is selected instead. */
function copyBlock(label: string, text: string) {
  const box = el("div", "", "hb-code");
  const pre = el("pre", "", "", { tabindex: "0", "aria-label": label });
  add(pre, el("code", text));
  const note = el("span", "", "hb-note", { role: "status", "aria-live": "polite" });
  const btn = el("button", "Copy", "hs-btn hb-btn hb-btn--alt hb-copy", { type: "button", "aria-label": `Copy ${label}` });
  btn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(text); note.textContent = "Copied"; }
    catch {
      const r = document.createRange();
      r.selectNodeContents(pre);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      pre.focus();
      note.textContent = "Copy blocked: text selected, press Ctrl+C";
    }
  });
  const row = el("div", "", "hb-row");
  add(row, btn, note);
  add(box, pre, row);
  return box;
}

/** Pictures for the gallery: live snapshot, declared cover, README screenshots (same-origin only, de-duplicated). */
export function pictures(p: Project): { url: string; alt: string }[] {
  const out: { url: string; alt: string }[] = [];
  const push = (u: string | null | undefined, alt: string) => { const s = sameOriginImg(u); if (s && !out.some((x) => x.url === s)) out.push({ url: s, alt }); };
  push(p.shot, `Screenshot of ${p.name}`);
  push(p.cover, `${p.name} preview`);
  for (const x of p.showcase?.images ?? []) push(x.url, x.alt || `${p.name} screenshot`);
  return out;
}

/** Index of the sections on the page; the one in view is marked aria-current. */
function pageIndex(sections: { id: string; title: string }[]) {
  const nav = el("nav", "", "hb-toc", { "aria-label": "On this page" });
  add(nav, el("p", "On this page", "hb-eyebrow"));
  const ul = el("ul");
  const links = sections.map((s) => {
    const a = el("a", s.title, "", { href: `#hb-s-${s.id}` });
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const t = document.getElementById(`hb-s-${s.id}`);
      t?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      t?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    });
    const li = el("li");
    add(li, a);
    add(ul, li);
    return a;
  });
  add(nav, ul);
  if (typeof IntersectionObserver !== "undefined") {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) {
        const id = e.target.id.replace(/^hb-s-/, "");
        links.forEach((a, i) => (sections[i].id === id ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
      }
    }, { rootMargin: "-30% 0px -60% 0px" });
    queueMicrotask(() => sections.forEach((s) => { const t = document.getElementById(`hb-s-${s.id}`); if (t) io.observe(t); }));
  }
  return nav;
}

export function buildStory(p: Project, all: Project[], back: HTMLElement): HTMLElement {
  const root = el("article", "", "hb-story");
  root.dataset.kind = kindOf(p);
  const sc = p.showcase;

  // ---- hero: what it is in one line, and the ways in ----
  const hero = el("header", "", "hb-hero");
  add(hero, kindLabel(p), ...heading(p, "h1", "hb-title", "hb-title", { tabindex: "-1" }));
  const line = pitchOf(p);
  if (line) add(hero, el("p", line, "hb-tagline"));
  const acts = el("div", "", "hb-acts hb-acts--hero");
  const ext = getIt(p);
  if (p.url && (!ext || ext.url !== p.url)) add(acts, link("Try it live", p.url, "hs-btn hb-btn hb-btn--lg"));
  if (ext) add(acts, link(ext.label, ext.url, `hs-btn hb-btn hb-btn--lg${p.url && ext.url !== p.url ? " hb-btn--alt" : ""}`));
  add(acts, link("Source on GitHub", `https://github.com/${p.repo}`, "hs-btn hb-btn hb-btn--alt hb-btn--lg"));
  add(hero, acts);
  // Info strip (store-page style): kind, built with, latest release, updated.
  const dl = el("dl", "", "hb-facts");
  const fact = (k: string, v: string) => { const d = el("div", "", "hb-fact"); add(d, el("dt", k), el("dd", v)); add(dl, d); };
  fact("Kind", KIND_TAG[kindOf(p)]);
  const langs = (p.languages ?? []).map((l) => l.lang);
  if (langs.length) fact("Built with", langs.slice(0, 3).join(", "));
  if (p.release) fact("Latest release", p.release.at ? `${p.release.tag} · ${fmtDate(p.release.at)}` : p.release.tag);
  const when = updated(p.pushedAt);
  if (when) fact("Activity", when);
  add(hero, dl);
  const dev = el("a", "Developer view", "hb-devlink", { href: toProjectPath(p.name) });
  add(hero, dev);
  add(root, back, hero);

  // ---- media: big main picture + thumbnails (or the name tile when there is none) ----
  const pics = pictures(p);
  const gal = el("section", "", "hb-media-sec", { "aria-label": "Pictures" });
  if (pics.length) {
    const main = el("button", "", "hb-main-pic", { type: "button", "aria-label": `View larger: ${pics[0].alt}` });
    add(main, media(p, "hb-media", true, pics[0].url, pics[0].alt, false)); // inside a labelled button: colour-only tile, no text
    main.addEventListener("click", () => lightbox(pics, 0, main));
    add(gal, main);
    if (pics.length > 1) {
      const ul = el("ul", "", "hb-thumbs", { "aria-label": "More pictures" });
      pics.slice(1).forEach((x, j) => {
        const li = el("li");
        const b = el("button", "", "hb-thumb", { type: "button", "aria-label": `View larger: ${x.alt}` });
        const im = el("img", "", "", { src: x.url, alt: "", width: "1280", height: "800", loading: "lazy", decoding: "async" });
        im.addEventListener("error", () => li.remove(), { once: true });
        add(b, im);
        b.addEventListener("click", () => lightbox(pics, j + 1, b));
        add(li, b);
        add(ul, li);
      });
      add(gal, ul);
    }
  } else add(gal, media(p, "hb-media hb-main-tile", true, null));
  gal.querySelector<HTMLElement>(".hb-media")?.style.setProperty("view-transition-name", "hb-pic");
  add(root, gal);

  // ---- sections, always in this order ----
  const sections: { id: string; title: string; node: HTMLElement }[] = [];
  const sec = (id: string, title: string, ...kids: (Node | string)[]) => {
    const s = el("section", "", `hb-ssec hb-s-${id}`, { id: `hb-s-${id}`, "aria-labelledby": `hb-sh-${id}` });
    add(s, el("h2", title, "hb-sh", { id: `hb-sh-${id}`, tabindex: "-1" }), ...kids);
    sections.push({ id, title, node: s });
  };

  const summary = sc?.summary?.trim();
  const box = el("div", "", "hb-prose");
  if (summary) for (const para of summary.split(/\n{2,}/)) { if (para.trim()) add(box, el("p", para.trim())); }
  else if (p.readme) {
    let ul: HTMLElement | null = null;
    for (const b of readmeBlocks(p.readme, 20)) {
      if (b.kind === "li") { if (!ul) add(box, (ul = el("ul"))); add(ul, el("li", b.text)); }
      else { ul = null; add(box, el("p", b.text)); }
    }
  } else if (p.description && p.description !== line) add(box, el("p", p.description));
  if (box.children.length) sec("overview", "Overview", box);

  if (sc?.highlights?.length) {
    const ul = el("ul", "", "hb-feats");
    for (const h of sc.highlights) {
      const { label, text } = splitHighlight(h);
      const li = el("li", "", "hb-feat");
      if (label) add(li, el("p", label, "hb-feat__t"));
      add(li, el("p", text, "hb-feat__d"));
      add(ul, li);
    }
    sec("highlights", "Highlights", ul);
  }

  if (sc?.howItWorks?.length) {
    const ul = el("ul", "", "hb-how");
    for (const h of sc.howItWorks) add(ul, el("li", h));
    sec("how", "How it works", ul);
  }

  const steps = sc?.runThrough?.steps ?? [], cmds = sc?.runThrough?.commands ?? [];
  if (steps.length || cmds.length) {
    const kids: Node[] = [];
    if (steps.length) { const ol = el("ol", "", "hb-steps"); for (const s of steps) add(ol, el("li", s)); kids.push(ol); }
    if (cmds.length) kids.push(copyBlock(`${p.name} commands`, cmds.join("\n")));
    sec("try", "How to try it", ...kids);
  }

  const topics = (p.topics ?? []).filter((t) => t !== "devpulse-ignore");
  if (langs.length || topics.length || p.license) {
    const kids: Node[] = [];
    if (langs.length) { kids.push(el("p", "Languages", "hb-sub")); const ul = el("ul", "", "hb-chips", { "aria-label": "Languages" }); for (const l of langs) add(ul, el("li", l, "hb-chip")); kids.push(ul); }
    if (topics.length) { kids.push(el("p", "Topics", "hb-sub")); const ul = el("ul", "", "hb-chips", { "aria-label": "Topics" }); for (const t of topics) add(ul, el("li", t, "hb-chip hb-chip--topic")); kids.push(ul); }
    if (p.license) kids.push(el("p", `${p.license} license`, "hb-fine"));
    sec("built", "Built with", ...kids);
  }

  const layout = el("div", "", `hb-layout${sections.length >= 2 ? " hb-layout--toc" : ""}`);
  const content = el("div", "", "hb-content");
  for (const s of sections) add(content, s.node);
  if (sections.length >= 2) add(layout, pageIndex(sections));
  add(layout, content);
  if (sections.length) add(root, layout);

  // ---- keep going: previous / next and related projects ----
  const nb = neighbours(p, all);
  if (nb) {
    const nav = el("nav", "", "hb-pn", { "aria-label": "More projects" });
    const pn = (q: Project, dir: "prev" | "next") => {
      const a = storyLink("", q, `hb-pn__a hb-pn__a--${dir}`);
      const d = el("span", "", "hb-pn__dir");
      if (dir === "prev") add(d, el("span", "← ", "", { "aria-hidden": "true" }), "Previous project");
      else add(d, "Next project", el("span", " →", "", { "aria-hidden": "true" }));
      add(a, d, el("span", titleOf(q), "hb-pn__name"));
      return a;
    };
    add(nav, pn(nb.prev, "prev"));
    if (nb.next.name !== nb.prev.name) add(nav, pn(nb.next, "next"));
    add(root, nav);
  }
  const rel = related(p, all, nb ? [nb.prev.name, nb.next.name] : []);
  if (rel.length) {
    const s = el("section", "", "hb-ssec hb-related", { "aria-labelledby": "hb-sh-more" });
    add(s, el("h2", "More like this", "hb-sh", { id: "hb-sh-more" }), grid(rel, { compact: true }));
    add(root, s);
  }
  return root;
}
