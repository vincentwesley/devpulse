// Showcase mode (lazy chunk): a gallery of every public project and a generated showcase page per project.
// Everything shown comes from the repo itself (README sections, metadata, languages, commits); a section without data is left out.
import "./gallery.css";
import { add, el, fmtDate, link, sameOriginImg, show, type Commit, type Project, type Res } from "./api";
import { commitsFor, firstLine, initialOf, readmeBlocks, relTime, safeColor, tileBackground, tileColors } from "./hubutil";
import { setMode } from "./mode";
import { navLink } from "./nav";
import { copyBlock, langBar } from "./showcase";
import { stageChip } from "./stage";
import { toProjectPath } from "./urlstate";

const pushed = (p: Project) => (p.pushedAt ? Date.parse(p.pushedAt) || 0 : 0);
/** Featured first, then the most recent push. */
export const galleryOrder = (ps: Project[]) => [...ps].sort((a, b) => Number(b.featured) - Number(a.featured) || pushed(b) - pushed(a) || a.name.localeCompare(b.name));

/** Typographic tile (the project's name on its language colours). Decorative: the card heading carries the name. */
function nameTile(p: Project, cls: string) {
  const t = el("div", "", `${cls} sg-tile`, { "aria-hidden": "true" });
  t.style.background = tileBackground(tileColors(p.languages));
  add(t, el("span", initialOf(p.name), "sg-tile__i"), el("span", p.name, "sg-tile__n"));
  return t;
}

/** Best real picture of the project: live snapshot, declared cover, first README screenshot; else the name tile. */
export function bestImage(p: Project) {
  return sameOriginImg(p.shot) ?? sameOriginImg(p.cover) ?? sameOriginImg(p.showcase?.images[0]?.url) ?? null;
}
function media(p: Project, cls: string, alt: string, eager = false) {
  const src = bestImage(p);
  if (!src) return nameTile(p, cls);
  const img = el("img", "", cls, { src, alt, width: "1280", height: "800", loading: eager ? "eager" : "lazy", decoding: "async" });
  const swap = () => img.replaceWith(nameTile(p, cls));
  img.addEventListener("error", swap, { once: true });
  img.addEventListener("load", () => { if (img.naturalWidth === 40 && img.naturalHeight === 21) swap(); }); // the Worker's 404 placeholder
  return img;
}

function topLangs(p: Project, n = 3) {
  const ul = el("ul", "", "sg-langs", { "aria-label": "Languages" });
  for (const l of p.languages.slice(0, n)) {
    const li = el("li");
    const dot = el("i", "", "hub-dot", { "aria-hidden": "true" });
    dot.style.background = safeColor(l.color);
    add(li, dot, `${l.lang} ${Math.round(l.pct)}%`);
    add(ul, li);
  }
  return ul;
}

function card(p: Project) {
  const c = el("article", "", "sg-card");
  c.dataset.name = p.name;
  const body = el("div", "", "sg-body");
  const h = el("h3", "", "sg-title");
  const a = navLink(p.name, toProjectPath(p.name), "sg-link");
  a.dataset.vp = p.name;
  add(h, a);
  add(body, h);
  const blurb = p.tagline ?? p.description;
  if (blurb) add(body, el("p", blurb, "sg-blurb"));
  if (p.languages?.length) add(body, langBar({ ...p, languages: p.languages.slice(0, 3) }), topLangs(p));
  const foot = el("div", "", "sg-foot");
  const st = stageChip(p);
  if (st) add(foot, st);
  if (p.url) add(foot, link("Live site", p.url, "hs-btn hub-btn sg-live"));
  add(body, foot);
  add(c, media(p, "sg-media", ""), body);
  return c;
}

function grid(ps: Project[]) {
  const ul = el("ul", "", "sg-grid");
  for (const p of ps) { const li = el("li"); add(li, card(p)); add(ul, li); }
  return ul;
}

function gallery(ps: Project[]) {
  const wrap = el("div", "", "sg");
  const live = galleryOrder(ps.filter((p) => !p.archived)), arch = galleryOrder(ps.filter((p) => p.archived));
  if (live.length) add(wrap, grid(live));
  if (arch.length) {
    const d = el("details", "", "sg-arch");
    add(d, el("summary", `Archive (${arch.length})`), grid(arch));
    add(wrap, d);
  }
  const n = document.getElementById("sg-count");
  if (n) n.textContent = `${live.length} ${live.length === 1 ? "project" : "projects"}${arch.length ? ` · ${arch.length} archived` : ""}`;
  return wrap;
}

/** Fill #showcase. A background refresh never redraws under keyboard focus. */
export function renderGallery(projects: Res<Project[]>) {
  const sec = document.getElementById("showcase")!;
  if (sec.contains(document.activeElement) && sec.querySelector(".sg")) return;
  show("showcase", projects, gallery);
  sec.removeAttribute("aria-busy");
}

// ---- project showcase page ----

let lbx: HTMLDialogElement | null = null;
/** Screenshot viewer: native <dialog> (Esc closes, focus trapped by the browser), arrow keys page, focus returns to the opener. */
function lightbox(imgs: { url: string; alt: string }[], start: number, opener: HTMLElement) {
  lbx?.remove();
  const d = el("dialog", "", "lbx", { "aria-label": "Screenshot viewer" });
  const fig = el("figure", "", "lbx__fig");
  const img = el("img", "", "lbx__img", { width: "1280", height: "800", alt: "" });
  const cap = el("figcaption", "", "lbx__cap");
  const pos = el("p", "", "meta lbx__pos", { "aria-live": "polite" });
  const prev = el("button", "Previous", "hs-btn hub-btn hub-btn--alt", { type: "button" });
  const next = el("button", "Next", "hs-btn hub-btn hub-btn--alt", { type: "button" });
  const close = el("button", "Close", "hs-btn hub-btn lbx__close", { type: "button" });
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

export interface PageOpts { commits: Commit[]; back: HTMLElement }

/** The full showcase for one project (main heading h1). textContent only; links are https-only via link(). */
export function buildShowcasePage(p: Project, o: PageOpts): HTMLElement {
  const root = el("article", "", "sp");
  const sc = p.showcase;
  const sec = (id: string, title: string, ...kids: (Node | string)[]) => {
    const s = el("section", "", `sp-sec sp-s-${id}`, { "aria-labelledby": `sp-h-${id}` });
    add(s, el("h2", title, "sp-h", { id: `sp-h-${id}` }), ...kids);
    add(root, s);
  };

  // Hero
  const hero = el("header", "", "sp-hero");
  const txt = el("div", "", "sp-hero__txt");
  add(txt, el("p", "Project showcase", "hs-eyebrow"), el("h1", p.name, "dt-title sp-title", { tabindex: "-1" }));
  if (p.tagline) add(txt, el("p", p.tagline, "sp-tag"));
  if (p.description && p.description !== p.tagline) add(txt, el("p", p.description, "sp-desc"));
  const meta = el("div", "", "lg-meta sp-meta");
  const st = stageChip(p);
  if (st) add(meta, st);
  if (p.release) add(meta, el("span", `release ${p.release.tag}`, "stg"));
  if (p.language) add(meta, el("span", p.language, "stg"));
  if (meta.children.length) add(txt, meta);
  const acts = el("div", "", "hub-actions");
  if (p.url) add(acts, link("Open live site", p.url, "hs-btn hub-btn"));
  add(acts, link("GitHub", `https://github.com/${p.repo}`, "hs-btn hub-btn hub-btn--alt"));
  const dev = el("button", "Developer view", "hs-btn hub-btn hub-btn--alt", { type: "button" });
  dev.addEventListener("click", () => setMode("dev"));
  add(acts, dev);
  add(txt, acts);
  add(hero, txt, media(p, "sp-hero__img", p.shot ? `Screenshot of ${p.name}'s live site` : bestImage(p) ? `${p.name} screenshot` : "", true));
  add(root, o.back, hero);

  // What it does
  const summary = sc?.summary?.trim();
  if (summary) {
    const box = el("div", "", "sp-prose");
    for (const para of summary.split(/\n{2,}/)) if (para.trim()) add(box, el("p", para.trim()));
    sec("what", "What it does", box);
  } else if (p.readme) {
    const box = el("div", "", "sp-prose");
    let ul: HTMLElement | null = null;
    for (const b of readmeBlocks(p.readme, 20)) {
      if (b.kind === "li") { if (!ul) add(box, (ul = el("ul"))); add(ul, el("li", b.text)); }
      else { ul = null; add(box, el("p", b.text)); }
    }
    sec("what", "What it does", box);
  }

  // Highlights
  if (sc?.highlights?.length) {
    const ul = el("ul", "", "sp-hl");
    for (const h of sc.highlights) add(ul, el("li", h));
    sec("highlights", "Highlights", ul);
  }

  // Screenshots (README images)
  const imgs = (sc?.images ?? []).filter((x) => sameOriginImg(x.url));
  if (imgs.length) {
    const ul = el("ul", "", "sp-shots");
    imgs.forEach((x, i) => {
      const li = el("li");
      const b = el("button", "", "sp-shot", { type: "button", "aria-label": `View larger: ${x.alt || `screenshot ${i + 1}`}` });
      const im = el("img", "", "", { src: x.url, alt: "", width: "1280", height: "800", loading: "lazy", decoding: "async" });
      im.addEventListener("error", () => li.remove(), { once: true });
      add(b, im);
      if (x.alt) add(li, b, el("p", x.alt, "meta sp-shot__cap"));
      else add(li, b);
      b.addEventListener("click", () => lightbox(imgs, i, b));
      add(ul, li);
    });
    sec("shots", "Screenshots", ul);
  }

  // Built with
  if (p.languages?.length || p.topics?.length || p.license) {
    const kids: Node[] = [];
    if (p.languages?.length) {
      const ul = el("ul", "", "sp-legend");
      for (const l of p.languages) {
        const li = el("li");
        const dot = el("i", "", "hub-dot", { "aria-hidden": "true" });
        dot.style.background = safeColor(l.color);
        add(li, dot, `${l.lang} `, el("span", `${l.pct.toFixed(1)}%`, "meta"));
        add(ul, li);
      }
      kids.push(langBar(p), ul);
    }
    if (p.topics?.length) {
      const ul = el("ul", "", "hub-topics sp-topics", { "aria-label": "Topics" });
      for (const t of p.topics) add(ul, el("li", t, "hs-chip"));
      kids.push(ul);
    }
    if (p.license) kids.push(el("p", `License: ${p.license}`, "meta"));
    sec("built", "Built with", ...kids);
  }

  // Run it
  const steps = sc?.runThrough?.steps ?? [], cmds = sc?.runThrough?.commands ?? [];
  if (steps.length || cmds.length) {
    const kids: Node[] = [];
    if (steps.length) { const ol = el("ol", "", "sp-steps"); for (const s of steps) add(ol, el("li", s)); kids.push(ol); }
    if (cmds.length) kids.push(copyBlock(`${p.name} commands`, cmds.join("\n"), "snip sp-cmds"));
    sec("run", "Run it", ...kids);
  }

  // By the numbers
  const dl = el("dl", "", "dt-stats sp-nums");
  const row = (k: string, v: string) => { const g = el("div"); add(g, el("dt", k), el("dd", v)); add(dl, g); };
  if (p.commitCount != null) row("Commits", p.commitCount.toLocaleString("en"));
  if (p.loc != null && p.loc > 0) row("Lines changed (approx.)", p.loc.toLocaleString("en"));
  row("Stars", p.stars.toLocaleString("en"));
  if (p.createdAt) row("Created", fmtDate(p.createdAt));
  if (p.pushedAt) row("Last push", relTime(p.pushedAt) || fmtDate(p.pushedAt));
  if (p.release) row("Latest release", `${p.release.tag}${p.release.at ? ` · ${fmtDate(p.release.at)}` : ""}`);
  sec("nums", "By the numbers", dl);

  // Recent changes
  const cs = commitsFor(p, o.commits).slice(0, 5);
  if (cs.length) {
    const ul = el("ul", "", "list sp-commits");
    for (const c of cs) { const li = el("li"); add(li, link(firstLine(c.message), c.url), el("span", ` ${relTime(c.ts) || fmtDate(c.ts)}`, "muted")); add(ul, li); }
    sec("changes", "Recent changes", ul);
  }

  if (p.detailAt) add(root, el("p", `Generated from the repo's README and GitHub metadata, refreshed ${relTime(p.detailAt) || fmtDate(p.detailAt)}.`, "meta sp-src"));
  return root;
}
