import { add, el } from "./api";

const nf = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
/** 12345 -> "12.3K". Use for hero tiles; hide a stat instead of showing 0. */
export const compact = (n: number) => nf.format(n);

/** "Updated 5m ago" from an ISO timestamp; "" when missing/invalid. */
export function updatedAgo(iso: string | null | undefined, now = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  const m = Math.max(0, Math.floor((now - t) / 6e4));
  if (m < 1) return "Updated just now";
  if (m < 60) return `Updated ${m}m ago`;
  if (m < 1440) return `Updated ${Math.floor(m / 60)}h ago`;
  return `Updated ${Math.floor(m / 1440)}d ago`;
}

const sec = (id: string) => document.getElementById(id);

/** Put a section back into its loading state (skeleton + aria-busy). */
export function loading(id: string) {
  const s = sec(id);
  if (!s) return;
  s.setAttribute("aria-busy", "true");
  s.querySelectorAll(":scope > .empty").forEach((e) => e.remove());
  if (!s.querySelector(":scope > .skel")) {
    const k = el("div", "", "skel body", { "aria-hidden": "true" });
    add(k, el("i"), el("i"), el("i"));
    add(s, k);
  }
}

/** Call after a section rendered: clears aria-busy, adds Retry to an error message. */
export function settle(id: string, retry: () => unknown) {
  const s = sec(id);
  if (!s) return;
  s.removeAttribute("aria-busy");
  s.querySelectorAll<HTMLElement>(".hero__stats").forEach((e) => (e.tabIndex = 0)); // scrollable on mobile: keyboard reachable
  const err = s.querySelector(":scope > .empty--err");
  if (err && !err.querySelector("button")) {
    const b = el("button", "Retry", "hs-btn retry", { type: "button" });
    b.addEventListener("click", () => { loading(id); void Promise.resolve(retry()).finally(() => s.removeAttribute("aria-busy")); }); // always ends settled
    add(err, " ", b);
  }
}
