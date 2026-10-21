import { add, el, show, type Language, type Languages, type Res } from "./api";

const HEX = /^#[0-9a-f]{6}$/i;
const color = (l: Language) => (l.color && HEX.test(l.color) ? l.color : "var(--accent)");
const pct = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;

function chart(list: Language[]) {
  const wrap = el("div", "", "lang__chart");
  const top = list.slice(0, 3).map((l) => `${l.lang} ${pct(l.pct)}`).join(", ");
  const bar = el("div", "", "lang__bar", { role: "img", "aria-label": `Language share by bytes. Top: ${top}` });
  const ul = el("ul", "", "lang__legend");
  for (const l of list) {
    const seg = el("span", "", "lang__seg");
    seg.style.width = `${Math.max(0, l.pct)}%`;
    seg.style.background = color(l);
    add(bar, seg);
    const sw = el("span", "", "lang__sw", { "aria-hidden": "true" });
    sw.style.background = color(l);
    const li = el("li");
    add(li, sw, el("span", l.lang), el("span", pct(l.pct), "muted"));
    add(ul, li);
  }
  add(wrap, bar, ul);
  return wrap;
}

export function renderLanguages(res: Res<Languages>) {
  show("languages", res, (d) => {
    const box = el("div");
    const view = el("div");
    const draw = (list: Language[]) => {
      view.replaceChildren(chart(list));
    };
    draw(d.public.length ? d.public : d.all);
    if (d.privateIncluded) {
      const tg = el("div", "", "lang__toggle", { role: "group", "aria-label": "Repository scope" });
      const mk = (text: string, list: Language[], on: boolean) => {
        const b = el("button", text, "hs-btn", { type: "button", "aria-pressed": String(on) });
        b.addEventListener("click", () => {
          tg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          draw(list);
        });
        return b;
      };
      add(tg, mk("Public", d.public, true), mk("All incl. private", d.all, false));
      add(box, tg);
    }
    add(box, view);
    return box;
  });
}
