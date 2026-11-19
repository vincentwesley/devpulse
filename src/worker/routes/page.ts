import type { Env } from "../env";
import { canonicalName } from "../lib/alias";
import { json, redirect } from "../lib/http";
import { firstSentence, readShowcase } from "../lib/showcase-readme";
import { NAME } from "./badge";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export interface Meta { title: string; description: string; url: string; image: string }

/**
 * Rewrite the built index.html head for one project. Plain string replacement (HTMLRewriter does not exist in the node test runtime):
 * each head tag is regenerated whole, every value attribute/text-escaped, so DB text can never break out of its tag.
 * Tags missing from the HTML are skipped.
 */
export function injectMeta(html: string, m: Meta): string {
  const [t, d, u, i] = [esc(m.title), esc(m.description), esc(m.url), esc(m.image)];
  const set = (re: RegExp, tag: string) => (html = html.replace(re, () => tag)); // fn replacer: no `$&` expansion
  set(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
  set(/<meta name="description"[^>]*>/, `<meta name="description" content="${d}">`);
  set(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${u}">`);
  for (const [k, v] of [["og:title", t], ["og:description", d], ["og:url", u], ["og:image", i]]) set(new RegExp(`<meta property="${k}"[^>]*>`), `<meta property="${k}" content="${v}">`);
  for (const [k, v] of [["twitter:title", t], ["twitter:description", d], ["twitter:image", i]]) set(new RegExp(`<meta name="${k}"[^>]*>`), `<meta name="${k}" content="${v}">`);
  return html;
}

/**
 * GET /p/:name -> the Project Hub shell ("/") with per-project social tags; GET /dev/p/:name -> the Developer shell ("/dev/").
 * Unknown name: same shell, status 404 (the client shows its own not-found).
 */
export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const dev = pathname.startsWith("/dev/p/");
  if (!dev && !pathname.startsWith("/p/")) return null;
  const base = dev ? "/dev/p/" : "/p/";
  const name = pathname.slice(base.length).replace(/\/$/, "");
  const origin = new URL(req.url).origin;
  // "/" and "/dev/" not ".../index.html": the assets binding redirects the latter.
  const shell = await env.ASSETS.fetch(new Request(new URL(dev ? "/dev/" : "/", origin)));
  if (!shell.ok) return json({ error: "not found" }, 404);
  const canon = NAME.test(name) ? await canonicalName(env, name) : null;
  if (canon && canon !== name) return redirect(`${base}${canon}`);
  const p = canon
    ? await env.DB.prepare("SELECT name, description, tagline, COALESCE(cover_path, readme_image) AS cover_path, showcase_json FROM projects WHERE name = ?").bind(canon).first<{ name: string; description: string | null; tagline: string | null; cover_path: string | null; showcase_json: string | null }>()
    : null;
  const headers = new Headers(shell.headers); // keeps the static CSP / HSTS from public/_headers
  headers.delete("Content-Length"); headers.delete("ETag");
  if (!p) {
    headers.set("Cache-Control", "no-store");
    return new Response(req.method === "HEAD" ? null : shell.body, { status: 404, headers });
  }
  const sc = readShowcase(p.showcase_json);
  const html = injectMeta(await shell.text(), {
    title: dev ? `${p.name} · DevPulse Developer` : `${sc.title ?? p.name} · DevPulse`,
    description: clip(p.tagline || p.description || firstSentence(sc.summary) || (dev ? `Live health of ${p.name}: uptime, CI, activity.` : `${p.name}, a project by Vin.`), 200),
    url: `${origin}${base}${p.name}`,
    image: `${origin}${p.cover_path ? `/img/${p.name}` : "/og.png"}`,
  });
  headers.set("Cache-Control", "public, max-age=300");
  return new Response(req.method === "HEAD" ? null : html, { status: 200, headers });
}
