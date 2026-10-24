// DevPulse service worker, emitted as /sw.js by vite.config.ts with a per-build cache id.
const V = "__BUILD__";
const API = `api-${V}`, ASSETS = `assets-${V}`, PAGE = `page-${V}`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => ![API, ASSETS, PAGE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

async function networkFirst(e, req, cacheName, key = req) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) e.waitUntil(cache.put(key, res.clone()).catch(() => {}));
    else if (res.status >= 500 || res.status === 429) return (await cache.match(key)) ?? res;
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) {
      self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage({ stale: true })));
      return hit;
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const r = e.request;
  const u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.startsWith("/api/")) e.respondWith(networkFirst(e, r, API));
  else if (u.pathname.startsWith("/assets/"))
    e.respondWith(caches.open(ASSETS).then(async (c) => (await c.match(r)) ?? fetch(r).then((res) => { if (res.ok) e.waitUntil(c.put(r, res.clone()).catch(() => {})); return res; })));
  else if (r.mode === "navigate" && u.pathname === "/") e.respondWith(networkFirst(e, r, PAGE, "/"));
});
