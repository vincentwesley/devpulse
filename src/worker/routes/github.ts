import type { Env } from "../env";
import { COMMITS_PER_REPO, COMMITS_RETURNED, HEATMAP_DAYS } from "../config";
import { json } from "../lib/http";

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET") return null;
  if (pathname === "/api/heatmap") {
    const from = new Date(Date.now() - HEATMAP_DAYS * 864e5).toISOString().slice(0, 10);
    const { results } = await env.DB.prepare("SELECT date, count FROM commits_daily WHERE date >= ? ORDER BY date ASC").bind(from).all();
    return json({ days: results }, 200, 300);
  }
  if (pathname === "/api/commits") {
    const { results } = await env.DB.prepare("SELECT repo, sha, message, author, ts, url FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY repo ORDER BY ts DESC) AS rn FROM commits_recent) WHERE rn <= ? ORDER BY ts DESC LIMIT ?")
      .bind(COMMITS_PER_REPO, COMMITS_RETURNED).all<{ message: string }>();
    return json(results.map((r) => ({ ...r, message: (r.message ?? "").split("\n")[0] })), 200, 300);
  }
  return null;
}
