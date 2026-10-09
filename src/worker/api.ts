import type { Env } from "./env";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (req.method === "GET") {
    if (pathname === "/api/health") return json({ ok: true });
    if (pathname === "/api/projects") {
      const { results } = await env.DB.prepare("SELECT * FROM projects ORDER BY name").all();
      return json(results);
    }
  }
  return json({ error: "not found" }, 404);
}
