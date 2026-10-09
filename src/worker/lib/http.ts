export const TIMEOUT_MS = 10_000;

export const json = (body: unknown, status = 200, cacheSeconds?: number) =>
  Response.json(body, { status, headers: cacheSeconds ? { "Cache-Control": `public, max-age=${cacheSeconds}` } : undefined });

/** Body text, or null if it exceeds maxBytes (checks Content-Length first, then the text length). */
export async function readBounded(src: Request | Response, maxBytes: number): Promise<string | null> {
  if (Number(src.headers.get("Content-Length")) > maxBytes) return null;
  const text = await src.text();
  return text.length > maxBytes ? null : text;
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
