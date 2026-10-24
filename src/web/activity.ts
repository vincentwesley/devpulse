import "./charts.css";
import { add, el, link, show, type Commit, type Res } from "./api";
import { relTime } from "./hubutil";

const STEP = 10;
const dayKey = (ts: string) => ts.slice(0, 10);
const dayLabel = (k: string) => new Date(k + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Group newest-first commits by UTC day. */
export function groupByDay(cs: Commit[]) {
  const m = new Map<string, Commit[]>();
  for (const c of cs) {
    const k = dayKey(c.ts);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(c);
  }
  return [...m];
}

// ponytail: commits only; /api/commits has no release events, so none are invented.
export function renderActivity(commits: Res<Commit[]>) {
  show("activity", commits, (all) => {
    const cs = [...all].sort((a, b) => b.ts.localeCompare(a.ts));
    const box = el("div");
    let shown = STEP;
    const draw = (focusFrom = -1) => {
      box.replaceChildren();
      let n = 0, target: HTMLElement | null = null;
      for (const [day, group] of groupByDay(cs.slice(0, shown))) {
        add(box, el("h3", dayLabel(day), "act__day"));
        const ul = el("ul", "", "act");
        for (const c of group) {
          const li = el("li");
          const a = link(c.message.split("\n")[0], c.url, "act__msg");
          if (n++ === focusFrom) target = a;
          add(li, el("code", c.sha.slice(0, 7), "act__sha"), a, el("span", `${c.repo} · ${relTime(c.ts)}`, "act__meta"));
          add(ul, li);
        }
        add(box, ul);
      }
      if (shown < cs.length) {
        const b = el("button", `Show more (${cs.length - shown})`, "hs-btn act__more", { type: "button" });
        b.addEventListener("click", () => { const from = shown; shown += STEP; draw(from); });
        add(box, b);
      }
      target?.focus();
    };
    draw();
    return box;
  });
}
