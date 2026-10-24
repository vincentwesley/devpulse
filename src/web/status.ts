import "./status.css";
import { add, el, link, show, type Incident, type Res, type SiteStatus, type Status } from "./api";

type Day = SiteStatus["days"][number];

/** Newest `n` days, oldest first. Missing days are not invented. */
export const lastBars = (days: Day[], n: number) => [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(-n);
/** Percent of checks that passed, null with no checks. */
export const dayPct = (d: Day) => (d.total > 0 ? (d.up / d.total) * 100 : null);
export const fmtPct = (n: number) => `${(Math.floor(n * 100 + 1e-9) / 100).toString()}%`;
/** Aggregate uptime over a window of days. */
export function windowPct(days: Day[]) {
  const t = days.reduce((s, d) => s + d.total, 0);
  return t ? (days.reduce((s, d) => s + d.up, 0) / t) * 100 : null;
}
/** "12 min", "2 h 5 min", "1 d 3 h", or "ongoing". */
export function fmtDuration(start: string, end: string | null, now = Date.now()) {
  const s = Date.parse(start), e = end ? Date.parse(end) : now;
  if (Number.isNaN(s) || Number.isNaN(e)) return "";
  const m = Math.max(1, Math.round((e - s) / 6e4));
  const t = m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${Math.floor(m / 1440)} d${Math.floor((m % 1440) / 60) ? ` ${Math.floor((m % 1440) / 60)} h` : ""}`;
  return end ? t : `ongoing, ${t}`;
}
const fmtDay = (date: string) => new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const barCls = (p: number | null) => (p === null ? "none" : p >= 99.9 ? "ok" : p >= 95 ? "warn" : "bad");

const strips = new Set<() => void>();
let mq: MediaQueryList | undefined;
const mobile = () => {
  if (!mq) {
    mq = matchMedia("(max-width: 639.98px)");
    mq.addEventListener("change", () => strips.forEach((f) => f()));
  }
  return mq;
};

function site(s: SiteStatus) {
  const card = el("article", "", "st__site");
  const head = el("div", "", "st__head");
  const pill = el("span", "", `st__pill st__pill--${s.up === true ? "up" : s.up === false ? "down" : "unk"}`);
  add(pill, el("span", s.up === true ? "▲" : s.up === false ? "▼" : "?", "", { "aria-hidden": "true" }), s.up === true ? " Up" : s.up === false ? " Down" : " Unknown");
  const pct = s.uptime90d ?? windowPct(s.days);
  add(head, el("h3", ""), pill, el("span", pct === null ? "no data yet" : `${fmtPct(pct)} uptime`, "st__pct"));
  add(head.firstElementChild!, link(s.name, s.url));

  const strip = el("div", "", "st__bars", { role: "group", "aria-label": `Daily uptime for ${s.name}` });
  const readout = el("p", "", "readout", { "aria-live": "polite" });
  const draw = () => {
    const bars = lastBars(s.days, mobile().matches ? 30 : 90);
    strip.replaceChildren();
    readout.textContent = bars.length ? `Last ${bars.length} days. Tap or focus a bar for details.` : "no data yet";
    const btns = bars.map((d, i) => {
      const p = dayPct(d);
      const txt = p === null ? `${fmtDay(d.date)} · no checks` : `${fmtDay(d.date)} · ${fmtPct(p)} (${d.up}/${d.total} checks)`;
      const b = el("button", "", `st__bar st__bar--${barCls(p)}`, { type: "button", "aria-label": txt, tabindex: i === bars.length - 1 ? "0" : "-1" });
      const say = () => { readout.textContent = txt; };
      b.addEventListener("focus", say);
      b.addEventListener("click", say);
      b.addEventListener("pointerenter", say);
      b.addEventListener("keydown", (e) => {
        const n = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: bars.length - 1 }[e.key];
        if (n === undefined || !btns[n]) return;
        e.preventDefault();
        b.tabIndex = -1;
        btns[n].tabIndex = 0;
        btns[n].focus();
      });
      return b;
    });
    add(strip, ...btns);
  };
  strips.add(draw);
  draw();
  add(card, head, strip, readout);
  return card;
}

function incidents(list: Incident[]) {
  const box = el("div", "", "st__inc");
  add(box, el("h3", "Incidents (90 days)"));
  if (!list.length) return add(box, el("p", "no incidents in 90 days", "muted")), box;
  const ul = el("ul", "", "list");
  for (const i of [...list].sort((a, b) => b.start.localeCompare(a.start))) {
    const li = el("li");
    add(li, el("strong", i.name), el("span", ` · ${fmtWhen(i.start)} · ${fmtDuration(i.start, i.end)} · ${i.status ? `HTTP ${i.status}` : "no response"}`, "muted"));
    add(ul, li);
  }
  add(box, ul);
  return box;
}

export function renderStatus(status: Res<Status>) {
  strips.clear();
  show("status", status, (d) => {
    const box = el("div");
    add(box, ...d.sites.map(site), incidents(d.incidents ?? []));
    return box;
  });
}
