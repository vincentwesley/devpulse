// Project story page (/p/<name>): what it is, what it can do, pictures, what it's built with, how to try it.
// Real repo content only (README sections, description, topics, languages, release); a section without data is left out.
import { add, el, fmtDate, link, sameOriginImg, type Project } from "../api";
import { readmeBlocks } from "../hubutil";
import { toProjectPath } from "../urlstate";
import { bestImage, media, tags, updated } from "./hub";

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
  const btn = el("button", "Copy", "hs-btn hb-btn hb-btn--alt", { type: "button", "aria-label": `Copy ${label}` });
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

export function buildStory(p: Project, back: HTMLElement): HTMLElement {
  const root = el("article", "", "hb-story");
  const sc = p.showcase;
  const sec = (id: string, title: string, ...kids: (Node | string)[]) => {
    const s = el("section", "", `hb-ssec hb-s-${id}`, { "aria-labelledby": `hb-sh-${id}` });
    add(s, el("h2", title, "hb-sh", { id: `hb-sh-${id}` }), ...kids);
    add(root, s);
  };

  // Hero: name, what it is in one line, the picture, and the ways in.
  const hero = el("header", "", "hb-hero");
  const txt = el("div", "", "hb-hero__txt");
  add(txt, el("h1", p.name, "hb-title", { tabindex: "-1" }));
  const line = p.tagline ?? p.description;
  if (line) add(txt, el("p", line, "hb-tagline"));
  add(txt, tags(p));
  const when = updated(p.pushedAt);
  if (when) add(txt, el("p", when, "hb-when"));
  const acts = el("div", "", "hb-acts");
  if (p.url) add(acts, link("Try it", p.url, "hs-btn hb-btn"));
  add(acts, link("Source on GitHub", `https://github.com/${p.repo}`, "hs-btn hb-btn hb-btn--alt"));
  add(acts, el("a", "Developer view", "hs-btn hb-btn hb-btn--alt", { href: toProjectPath(p.name) }));
  add(txt, acts);
  add(hero, txt, media(p, "hb-hero__img", true));
  add(root, back, hero);

  // What it is
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
  if (box.children.length) sec("what", "What it is", box);

  // What it can do
  if (sc?.highlights?.length) {
    const ul = el("ul", "", "hb-feats");
    for (const h of sc.highlights) add(ul, el("li", h));
    sec("can", "What it can do", ul);
  }

  // Gallery: README screenshots, plus the live snapshot when the hero shows something else.
  const hero1 = bestImage(p);
  const pics = [
    ...(sameOriginImg(p.shot) && p.shot !== hero1 ? [{ url: p.shot!, alt: `Screenshot of ${p.name}` }] : []),
    ...(sc?.images ?? []).filter((x) => sameOriginImg(x.url) && x.url !== hero1),
  ];
  if (pics.length) {
    const ul = el("ul", "", "hb-gal");
    pics.forEach((x, i) => {
      const li = el("li");
      const b = el("button", "", "hb-pic", { type: "button", "aria-label": `View larger: ${x.alt || `picture ${i + 1}`}` });
      const im = el("img", "", "", { src: x.url, alt: "", width: "1280", height: "800", loading: "lazy", decoding: "async" });
      im.addEventListener("error", () => li.remove(), { once: true });
      add(b, im);
      add(li, b);
      if (x.alt) add(li, el("p", x.alt, "hb-cap"));
      b.addEventListener("click", () => lightbox(pics, i, b));
      add(ul, li);
    });
    sec("gallery", "Gallery", ul);
  }

  // Built with: names only, no percentages.
  const langs = (p.languages ?? []).map((l) => l.lang), topics = p.topics ?? [];
  if (langs.length || topics.length || p.license) {
    const kids: Node[] = [];
    if (langs.length) { const ul = el("ul", "", "hb-chips", { "aria-label": "Languages" }); for (const l of langs) add(ul, el("li", l, "hb-tag")); kids.push(ul); }
    if (topics.length) { const ul = el("ul", "", "hb-chips", { "aria-label": "Topics" }); for (const t of topics) add(ul, el("li", t, "hb-tag hb-tag--topic")); kids.push(ul); }
    if (p.license) kids.push(el("p", `${p.license} license`, "hb-fine"));
    sec("built", "Built with", ...kids);
  }

  // Try it yourself
  const steps = sc?.runThrough?.steps ?? [], cmds = sc?.runThrough?.commands ?? [];
  if (steps.length || cmds.length) {
    const kids: Node[] = [];
    if (steps.length) { const ol = el("ol", "", "hb-steps"); for (const s of steps) add(ol, el("li", s)); kids.push(ol); }
    if (cmds.length) kids.push(copyBlock(`${p.name} commands`, cmds.join("\n")));
    sec("try", "Try it yourself", ...kids);
  }

  // Latest release
  if (p.release) sec("release", "Latest release", el("p", p.release.at ? `${p.release.tag}, released ${fmtDate(p.release.at)}` : p.release.tag, "hb-fine"));
  return root;
}
