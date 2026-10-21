import { add, el, link, show, type Commit, type Res } from "./api";

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["day", 864e5], ["hour", 36e5], ["minute", 6e4]];
export function ago(ts: string, now = Date.now()) {
  const d = new Date(ts).getTime() - now;
  for (const [u, ms] of UNITS) if (Math.abs(d) >= ms) return rtf.format(Math.round(d / ms), u);
  return "just now";
}

// ponytail: commits only; the API has no release-event feed. Merge more sources here when it does.
export function renderActivity(res: Res<Commit[]>) {
  show("activity", res, (cs) => {
    const ul = el("ul", "", "act");
    for (const c of [...cs].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 15)) {
      const li = el("li");
      const t = el("time", ago(c.ts), "muted", { datetime: c.ts });
      add(li, link(c.message.split("\n")[0], c.url), el("span", ` ${c.repo} · `, "muted"), t);
      add(ul, li);
    }
    return ul;
  });
}
