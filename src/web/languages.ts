import { add, el, type Language, type Languages } from "./api";
import { safeColor } from "./hubutil";

export const pct = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
const LEGEND = 5;

/** One stacked bar over the combined list, legend for the top five. */
export function langsTile(d: Languages) {
  const list: Language[] = d.all;
  const top = list.slice(0, LEGEND);
  const wrap = el("div", "", "lang__chart");
  const bar = el("div", "", "lang__bar", { role: "img", "aria-label": `Language share by bytes: ${top.map((l) => `${l.lang} ${pct(l.pct)}`).join(", ")}` });
  for (const l of list) {
    const seg = el("span", "", "lang__seg");
    seg.style.width = `${Math.max(0, l.pct)}%`;
    seg.style.background = safeColor(l.color);
    add(bar, seg);
  }
  const ul = el("ul", "", "lang__legend");
  for (const l of top) {
    const sw = el("span", "", "lang__sw", { "aria-hidden": "true" });
    sw.style.background = safeColor(l.color);
    const li = el("li");
    add(li, sw, el("span", l.lang, "lang__n"), el("span", pct(l.pct), "lang__p"));
    add(ul, li);
  }
  add(wrap, bar, ul);
  return wrap;
}
