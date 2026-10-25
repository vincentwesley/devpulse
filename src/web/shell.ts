import { add, el, type Project, type Res, type Stats, type Status } from "./api";
import { relTime } from "./hubutil";

let onAttn: () => void = () => {};
/** main.ts wires the verdict pill to the ledger's Failing filter (keeps this module free of DOM-heavy imports). */
export const setAttnHandler = (f: () => void) => { onAttn = f; };

export interface Verdict { level: "ok" | "attn" | "none"; attention: number; text: string }

const failing = (p: Project) => p.ci?.conclusion === "failure" || p.ciState === "FAILURE" || p.ciState === "ERROR";

/** Overall health from projects with CI or uptime data. Attention = CI failure, site down or an open incident. */
export function verdict(projects: Project[], status: Status | null): Verdict {
  const watched = projects.filter((p) => p.url || p.ci || p.ciState);
  if (!watched.length) return { level: "none", attention: 0, text: "No data yet" };
  const bad = new Set<string>();
  for (const p of watched) if (failing(p) || p.up === false) bad.add(p.repo);
  for (const i of status?.incidents ?? []) {
    if (i.end !== null) continue;
    bad.add(status?.sites.find((s) => s.name === i.name)?.repo ?? i.name);
  }
  const n = bad.size;
  return n ? { level: "attn", attention: n, text: `${n} need${n === 1 ? "s" : ""} attention` } : { level: "ok", attention: 0, text: "All systems normal" };
}

/** Banner lines: stale data, token near expiry. Empty = hide the banner. */
export function bannerMessages(h: Stats["health"] | undefined, now = Date.now()): string[] {
  const out: string[] = [];
  if (h?.stale) out.push(h.since ? `Data is stale since ${relTime(h.since, now)}` : "Data is stale");
  const d = h?.tokenDaysLeft;
  if (typeof d === "number" && d <= 14) out.push(d <= 0 ? "GitHub token has expired" : `GitHub token expires in ${d} day${d === 1 ? "" : "s"}`);
  return out;
}

const pill = () => document.getElementById("verdict")!;
const banner = () => document.getElementById("banner")!;

function setVerdict(level: string, text: string) {
  const p = pill();
  p.dataset.s = level;
  p.replaceChildren();
  add(p, el("span", "", "dp-glyph", { "aria-hidden": "true" }));
  if (level === "attn") { // the pill is a shortcut to the Failing filter
    const b = el("button", text, "verdict__t verdict__btn", { type: "button" });
    b.addEventListener("click", () => onAttn());
    add(p, b);
  } else add(p, el("span", text, "verdict__t"));
}

/** Fill the header verdict pill and the slim banner from the three shared fetches. */
export function renderHealth(projects: Res<Project[]>, stats: Res<Stats>, status: Res<Status>) {
  if (projects.state === "ok") {
    const v = verdict(projects.data, status.state === "ok" ? status.data : null);
    setVerdict(v.level, v.text);
  } else if (!pill().dataset.s || projects.state === "empty") setVerdict("none", projects.state === "error" ? "Status unavailable" : "No data yet");
  const b = banner();
  if (stats.state === "error") return; // a failed refresh keeps the last banner
  const msgs = stats.state === "ok" ? bannerMessages(stats.data.health) : [];
  b.replaceChildren();
  for (const m of msgs) add(b, el("span", m, "banner__msg"));
  b.hidden = !msgs.length;
}
