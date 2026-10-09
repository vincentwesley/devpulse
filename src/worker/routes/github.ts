import type { Env } from "../env";

const json = (body: unknown) => Response.json(body, { headers: { "Cache-Control": "public, max-age=300" } });

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET") return null;
  if (pathname === "/api/heatmap") {
    const from = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const { results } = await env.DB.prepare("SELECT date, count FROM commits_daily WHERE date >= ? ORDER BY date ASC").bind(from).all();
    return json({ days: results });
  }
  if (pathname === "/api/commits") {
    const { results } = await env.DB.prepare("SELECT repo, sha, message, author, ts, url FROM commits_recent ORDER BY ts DESC LIMIT 20").all<{ message: string }>();
    return json(results.map((r) => ({ ...r, message: (r.message ?? "").split("\n")[0] })));
  }
  return null;
}
