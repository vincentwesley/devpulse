import type { Env } from "../env";
import { POSTS } from "../config";
import { json } from "../lib/http";

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (pathname !== "/api/posts" || req.method !== "GET") return null;
  const { results } = await env.DB.prepare("SELECT title, url, published FROM posts ORDER BY published DESC LIMIT ?").bind(POSTS).all();
  return json(results, 200, 300);
}
