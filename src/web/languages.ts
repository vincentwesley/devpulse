import { add, el, show, type Language, type Languages, type Res } from "./api";
import { safeColor } from "./hubutil";

const pct = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;

function chart(list: Language[]) {
  const wrap = el("div", "", "lang__chart");
  const top = list.slice(0, 3).map((l) => `${l.lang} ${pct(l.pct)}`).join(", ");
  const bar = el("div", "", "lang__bar", { role: "img", "aria-label": `Language share by bytes. Top: ${top}` });
  const ul = el("ul", "", "lang__legend");
  for (const l of list) {
    const seg = el("span", "", "lang__seg");
    seg.style.width = `${Math.max(0, l.pct)}%`;
    seg.style.background = safeColor(l.color);
    add(bar, seg);
    const sw = el("span", "", "lang__sw", { "aria-hidden": "true" });
    sw.style.background = safeColor(l.color);
    const li = el("li");
    add(li, sw, el("span", l.lang), el("span", pct(l.pct), "muted"));
    add(ul, li);
  }
  add(wrap, bar, ul);
  return wrap;
}

export function renderLanguages(langs: Res<Languages>) {
  show("languages", langs, (d) => chart(d.all));
}
