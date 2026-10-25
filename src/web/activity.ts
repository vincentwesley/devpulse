import "./feed.css";
import { add, el, link, show, type Commit, type Res } from "./api";
import { relTime } from "./hubutil";

const STEP = 10;
const dayKey = (ts: string) => ts.slice(0, 10);
const dayLabel = (k: string) => new Date(k + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

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
    const feed = el("div", "", "act-feed");
    const more = el("button", "", "hs-btn act__more", { type: "button", "aria-expanded": "false" });
    let shown = STEP;
    const draw = (focusFrom = -1) => {
      feed.replaceChildren();
      let n = 0, target: HTMLElement | null = null;
      for (const [day, group] of groupByDay(cs.slice(0, shown))) {
        const sec = el("div", "", "act-day");
        add(sec, el("h3", dayLabel(day), "act__day"));
        const ul = el("ul", "", "act");
        for (const c of group) {
          const line = c.message.split("\n")[0];
          const li = el("li");
          const a = link(line, c.url, "act__msg");
          a.title = line;
          if (n++ === focusFrom) target = a;
          const sha = link(c.sha.slice(0, 7), c.url, "act__sha");
          add(li, el("span", c.repo.split("/").pop()!, "act__repo", { title: c.repo }), a, sha, el("span", relTime(c.ts), "act__meta"));
          add(ul, li);
        }
        add(sec, ul);
        add(feed, sec);
      }
      more.hidden = shown >= cs.length;
      more.textContent = `Show more (${Math.max(0, cs.length - shown)})`;
      more.setAttribute("aria-expanded", String(shown > STEP));
      target?.focus();
    };
    more.addEventListener("click", () => { const from = shown; shown += STEP; draw(from); });
    draw();
    add(box, feed, more);
    return box;
  });
}
