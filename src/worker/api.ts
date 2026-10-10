import type { Env } from "./env";
import { json } from "./lib/http";
import * as github from "./routes/github";
import * as ingest from "./routes/ingest";
import * as posts from "./routes/posts";
import * as projects from "./routes/projects";

const CACHED = new Set(["/api/projects", "/api/heatmap", "/api/commits", "/api/posts"]);

/** Edge cache keyed on pathname only, so query strings can't force D1 reads. Absent (unit tests) -> skip. */
async function cached(req: Request, pathname: string, run: () => Promise<Response | null>): Promise<Response | null> {
  const cache = typeof caches === "undefined" || req.method !== "GET" || !CACHED.has(pathname) ? undefined : (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL(pathname, new URL(req.url).origin));
  const hit = await cache?.match(key);
  if (hit) return hit;
  const res = await run();
  if (res?.ok) await cache?.put(key, res.clone());
  return res;
}

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url);
  try {
    if (req.method === "GET" && pathname === "/api/health") return json({ ok: true });
    for (const m of [projects, github, posts, ingest]) {
      const res = await cached(req, pathname, () => m.route(req, env, pathname));
      if (res) return res;
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error("api error:", e instanceof Error ? e.message : String(e));
    return json({ error: "internal error" }, 500);
  }
}
