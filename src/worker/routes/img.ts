import type { Env } from "../env";
import { canonicalName } from "../lib/alias";
import { image, readBytes, redirect, svg, TIMEOUT_MS } from "../lib/http";
import { relImage } from "../lib/audit";
import { readShowcase } from "../lib/showcase-readme";
import { NAME } from "./badge";

const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]); // never svg
const MAX_BYTES = 2 * 1024 * 1024;
// <img>/og:image consumers get a small grey placeholder instead of JSON; 404 + no-store so the page's onerror fallback still fires.
const PLACEHOLDER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 21" width="40" height="21"><rect width="40" height="21" fill="#8a8f87"/></svg>';
const notFound = () => svg(PLACEHOLDER, 404, 0);

/**
 * GET /img/:name -> the declared cover (.devpulse.json image), else the first README image. GET /img/:name/:i (0..5) -> README showcase image i.
 * Origin is built from GITHUB_OWNER + the stored repo and a stored, validated path, never from the request.
 */
export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if ((req.method !== "GET" && req.method !== "HEAD") || !pathname.startsWith("/img/")) return null;
  const [name, idx, extra] = pathname.slice(5).split("/");
  if (!NAME.test(name) || extra !== undefined || (idx !== undefined && !/^[0-5]$/.test(idx))) return notFound();
  const canon = await canonicalName(env, name);
  if (!canon) return notFound();
  if (canon !== name) return redirect(`/img/${canon}${idx === undefined ? "" : `/${idx}`}${new URL(req.url).search}`);
  const p = await env.DB.prepare("SELECT repo, cover_path, readme_image, showcase_json FROM projects WHERE name = ?").bind(name).first<{ repo: string; cover_path: string | null; readme_image: string | null; showcase_json: string | null }>();
  const file = !p ? null : idx === undefined ? p.cover_path ?? (p.readme_image && relImage(p.readme_image)) : readShowcase(p.showcase_json).images[Number(idx)]?.path ?? null;
  if (!p || !file) return notFound();
  const repo = p.repo.split("/").pop()!;
  const path = file.split("/").map(encodeURIComponent).join("/");
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
