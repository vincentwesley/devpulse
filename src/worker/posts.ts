import type { Env } from "./env";
import { POSTS } from "./config";
import { isHttps } from "./lib/github-parse";
import { TIMEOUT_MS } from "./lib/http";
import { parseFeed } from "./lib/rss";

export async function syncPosts(env: Env): Promise<void> {
  if (!env.PORTFOLIO_RSS_URL) return console.warn("PORTFOLIO_RSS_URL unset; skipping posts sync");
  const res = await fetch(env.PORTFOLIO_RSS_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`posts feed ${res.status}`);
  const items = parseFeed(await res.text())
    .filter((p) => isHttps(p.url))
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, POSTS);
  if (!items.length) return; // keep old rows if feed parsed empty
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM posts"),
    ...items.map((p) =>
      env.DB.prepare("INSERT OR REPLACE INTO posts (url, title, published, ts) VALUES (?,?,?,?)").bind(p.url, p.title, p.published, now)),
  ]);
}
