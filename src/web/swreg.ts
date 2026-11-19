/** Offline banner + service worker, shared by both pages. One SW (/sw.js, scope "/") serves the hub and /dev/. */
export function initOffline(offline: HTMLElement) {
  const sync = () => { offline.hidden = navigator.onLine; };
  addEventListener("online", sync);
  addEventListener("offline", sync);
  sync();
  if (!("serviceWorker" in navigator)) return;
  try {
    navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.stale) offline.hidden = false; });
    // register() is a TrustedScriptURL sink under CSP require-trusted-types-for; the one policy only mints "/sw.js".
    const tt = (window as { trustedTypes?: { createPolicy(n: string, r: { createScriptURL(u: string): string }): { createScriptURL(u: string): string } } }).trustedTypes;
    const swUrl = tt?.createPolicy("devpulse", { createScriptURL: (u) => { if (u !== "/sw.js") throw new TypeError("blocked"); return u; } }).createScriptURL("/sw.js") ?? "/sw.js";
    addEventListener("load", () => navigator.serviceWorker.register(swUrl).catch(() => {}));
  } catch {}
}
