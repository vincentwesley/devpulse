import type { Env } from "./env";
import { json } from "./lib/http";
import * as github from "./routes/github";
import * as ingest from "./routes/ingest";
import * as posts from "./routes/posts";
import * as projects from "./routes/projects";

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url);
  try {
    if (req.method === "GET" && pathname === "/api/health") return json({ ok: true });
    for (const m of [projects, github, posts, ingest]) {
      const res = await m.route(req, env, pathname);
      if (res) return res;
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    console.error("api error:", e instanceof Error ? e.message : String(e));
    return json({ error: "internal error" }, 500);
  }
}
