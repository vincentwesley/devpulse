import type { Env } from "../env";
import { image, json, readBytes, TIMEOUT_MS } from "../lib/http";
import { NAME } from "./badge";

const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]); // never svg
const MAX_BYTES = 2 * 1024 * 1024;
const notFound = () => json({ error: "not found" }, 404);

/** GET /img/:name -> the cover image a public project declared in .devpulse.json. Origin is built from GITHUB_OWNER + the stored repo, never from the request. */
export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if ((req.method !== "GET" && req.method !== "HEAD") || !pathname.startsWith("/img/")) return null;
  const name = pathname.slice(5);
  if (!NAME.test(name)) return notFound();
  const p = await env.DB.prepare("SELECT repo, cover_path FROM projects WHERE name = ? AND cover_path IS NOT NULL").bind(name).first<{ repo: string; cover_path: string }>();
  if (!p) return notFound();
  const repo = p.repo.split("/").pop()!;
  const path = p.cover_path.split("/").map(encodeURIComponent).join("/");
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(repo)}/HEAD/${path}`, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const type = (r.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    if (r.status !== 200 || !TYPES.has(type)) { await r.body?.cancel().catch(() => {}); return notFound(); }
    const bytes = await readBytes(r, MAX_BYTES);
    return bytes?.length ? image(req.method === "HEAD" ? null : bytes, type) : notFound();
  } catch {
    return notFound();
  }
}
