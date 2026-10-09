import type { Env } from "../env";

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (pathname !== "/api/posts" || req.method !== "GET") return null;
  const { results } = await env.DB.prepare("SELECT title, url, published FROM posts ORDER BY published DESC LIMIT 5").all();
  return Response.json(results, { headers: { "Cache-Control": "public, max-age=300" } });
}
