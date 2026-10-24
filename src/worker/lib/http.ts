export const TIMEOUT_MS = 10_000;

// Every Worker response (JSON, SVG, XML) carries these.
const SEC = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Referrer-Policy": "no-referrer",
};
const cc = (ttl?: number) => (ttl ? `public, max-age=${ttl}` : "no-store");

export const json = (body: unknown, status = 200, cacheSeconds?: number, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...SEC, "Cache-Control": cc(cacheSeconds), ...extra } });

/** Non-JSON body (SVG / Atom). Embeddable cross-origin (badges, cards). */
export const doc = (body: string, type: string, status = 200, cacheSeconds?: number) =>
  new Response(body, { status, headers: { ...SEC, "Content-Type": type, "Cache-Control": cc(cacheSeconds), "Cross-Origin-Resource-Policy": "cross-origin" } });
export const svg = (body: string, status = 200, cacheSeconds = 300) => doc(body, "image/svg+xml; charset=utf-8", status, cacheSeconds);

export const UA = "DevPulse/1.0 (uptime monitor for vincentwesley's own projects; +https://github.com/vincentwesley)";

/** Body text, or null if it exceeds maxBytes (Content-Length first, then a streamed byte count that aborts early). */
export async function readBounded(src: Request | Response, maxBytes: number): Promise<string | null> {
  if (Number(src.headers.get("Content-Length")) > maxBytes) return null;
  if (!src.body) return "";
  const reader = src.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    n += r.value.byteLength;
    if (n > maxBytes) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(r.value);
  }
  const all = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(all);
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Run fn over items with bounded concurrency; failures are logged (message only) and dropped. */
export async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const q = [...items];
  const out: R[] = [];
  await Promise.all(Array.from({ length: Math.min(limit, q.length) }, async () => {
    for (let x = q.shift(); x !== undefined; x = q.shift()) {
      try { out.push(await fn(x)); } catch (e) { console.error("task failed:", msg(e)); }
    }
  }));
  return out;
}
