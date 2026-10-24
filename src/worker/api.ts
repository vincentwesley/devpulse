import type { Env } from "./env";
import { json } from "./lib/http";
import * as badge from "./routes/badge";
import * as card from "./routes/card";
import * as feed from "./routes/feed";
import * as img from "./routes/img";
import * as page from "./routes/page";
import * as github from "./routes/github";
import * as health from "./routes/health";
import * as posts from "./routes/posts";
import * as projects from "./routes/projects";
import * as stats from "./routes/stats";
import * as status from "./routes/status";

const API = [projects, github, posts, stats, status, health];
const CACHED = new Set(["/api/projects", "/api/heatmap", "/api/commits", "/api/posts", "/api/stats", "/api/languages", "/api/status", "/feed.xml"]);
// Badges/cards: only 200s are stored (public Cache-Control); every 404 and error is no-store, so random names can't grow the cache.
const isCached = (p: string) => CACHED.has(p) || p.startsWith("/badge/") || p.startsWith("/card/") || p.startsWith("/img/") || p.startsWith("/p/");

/** Rate limit per client IP. No binding (unit tests, local dev) => no limit. A limiter outage fails open. */
async function limited(req: Request, env: Env): Promise<Response | null> {
  if (!env.RL) return null;
  try {
    const { success } = await env.RL.limit({ key: req.headers.get("cf-connecting-ip") ?? "unknown" });
    return success ? null : json({ error: "rate limited" }, 429, undefined, { "Retry-After": "10" });
  } catch {
    return null;
  }
}

async function dispatch(req: Request, env: Env, pathname: string): Promise<Response> {
  let res: Response | null = null;
  if (pathname.startsWith("/badge/")) res = await badge.route(req, env, pathname);
  else if (pathname.startsWith("/card/")) res = await card.route(req, env, pathname);
  else if (pathname.startsWith("/img/")) res = await img.route(req, env, pathname);
  else if (pathname.startsWith("/p/")) res = await page.route(req, env, pathname);
  else if (pathname === "/feed.xml") res = await feed.route(req, env, pathname);
  else if (pathname.startsWith("/api/")) for (const m of API) if ((res = await m.route(req, env, pathname))) break;
  return res ?? json({ error: "not found" }, 404);
}

/** Edge cache keyed on pathname only, so query strings can't force D1 reads. One lookup per request. Absent (unit tests) -> skip. */
export async function handleApi(req: Request, env: Env): Promise<Response> {
  const { pathname, origin } = new URL(req.url);
  try {
    // /img/* is exempt: name-validated, 2 MB cap, cached 24h at the edge and in the browser/SW; a page of covers must not trip 60/10s.
    const rl = pathname.startsWith("/img/") ? null : await limited(req, env);
    if (rl) return rl;
    const cache = typeof caches === "undefined" || req.method !== "GET" || !isCached(pathname) ? undefined : (caches as unknown as { default: Cache }).default;
    const key = new Request(new URL(pathname, origin));
    const hit = await cache?.match(key);
    if (hit) return hit;
    const res = await dispatch(req, env, pathname);
    if (cache && res.headers.get("Cache-Control")?.startsWith("public")) await cache.put(key, res.clone());
    return res;
  } catch (e) {
    console.error("api error:", e instanceof Error ? e.message : String(e));
    return json({ error: "internal error" }, 500);
  }
}
