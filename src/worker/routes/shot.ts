import type { Env } from "../env";
import { canonicalName } from "../lib/alias";
import { found, redirect, shotImage, svg } from "../lib/http";
import { NAME } from "./badge";

const PLACEHOLDER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 21" width="40" height="21"><rect width="40" height="21" fill="#8a8f87"/></svg>';

/**
 * GET|HEAD /shot/:name.jpg -> the latest Browser Run screenshot of a public project's live site.
 * No shot yet -> 302 to /img/:name (the committed cover / README screenshot), else a 404 placeholder (no-store). Never private repos: only `projects` rows.
 */
export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const m = /^\/shot\/(.+)\.jpg$/.exec(pathname);
  if (!m) return null;
  const notFound = () => svg(PLACEHOLDER, 404, 0);
  if (!NAME.test(m[1])) return notFound();
  const n = await canonicalName(env, m[1]);
  if (!n) return notFound();
  if (n !== m[1]) return redirect(`/shot/${n}.jpg`);
  const p = await env.DB.prepare("SELECT p.name, p.cover_path, p.readme_image, s.bytes, s.type, s.taken_at FROM projects p LEFT JOIN shots s ON s.repo = p.repo WHERE p.name = ?")
    .bind(n).first<{ name: string; cover_path: string | null; readme_image: string | null; bytes: ArrayBuffer | number[] | null; type: string | null; taken_at: number | null }>();
  if (!p) return notFound();
  if (p.bytes && p.taken_at != null) {
    const etag = `"${p.taken_at}"`;
    if (req.headers.get("If-None-Match") === etag) return shotImage(null, p.type ?? "image/jpeg", etag, 304);
    return shotImage(req.method === "HEAD" ? null : new Uint8Array(p.bytes as ArrayBuffer), p.type ?? "image/jpeg", etag);
  }
  return p.cover_path || p.readme_image ? found(`/img/${p.name}`, 3600) : notFound();
}
