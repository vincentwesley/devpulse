import type { Env } from "../env";
import { POSTS } from "../config";
import { isHttps } from "../lib/github-parse";
import { doc } from "../lib/http";
import { xml } from "./badge";

const MAX = 50;
interface Entry { id: string; title: string; url: string; at: string }

export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET" || pathname !== "/feed.xml") return null;
  const db = env.DB;
  const [commits, releases, posts] = (await db.batch([
    db.prepare("SELECT repo, sha, message, ts, url FROM commits_recent ORDER BY ts DESC LIMIT ?").bind(MAX),
    db.prepare("SELECT repo, name, release_tag, release_at FROM projects WHERE release_tag IS NOT NULL AND release_at IS NOT NULL ORDER BY release_at DESC LIMIT ?").bind(MAX),
    db.prepare("SELECT title, url, published FROM posts ORDER BY published DESC LIMIT ?").bind(POSTS),
  ])) as { results: any[] }[];
  const all: Entry[] = [
    ...commits.results.map((c) => ({ id: `commit:${c.sha}`, title: `${c.repo.split("/").pop()}: ${String(c.message ?? "").split("\n")[0].slice(0, 200)}`, url: c.url, at: c.ts })),
    ...releases.results.map((r) => ({ id: `release:${r.repo}:${r.release_tag}`, title: `${r.name} ${r.release_tag}`, url: `https://github.com/${r.repo}/releases/tag/${encodeURIComponent(r.release_tag)}`, at: r.release_at })),
    ...posts.results.map((p) => ({ id: `post:${p.url}`, title: p.title, url: p.url, at: p.published })),
  ].flatMap((e) => {
    const d = new Date(e.at);
    return isHttps(e.url) && !isNaN(+d) ? [{ ...e, at: d.toISOString() }] : [];
  }).sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX);

  const origin = new URL(req.url).origin;
  const updated = all[0]?.at ?? new Date().toISOString();
  const body = `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>DevPulse</title><id>${xml(origin)}/feed.xml</id><updated>${updated}</updated>` +
    `<link rel="self" type="application/atom+xml" href="${xml(origin)}/feed.xml"/><link rel="alternate" href="${xml(origin)}/"/><author><name>vincentwesley</name></author>` +
    all.map((e) => `<entry><id>${xml(`tag:devpulse.vincentwesleybiz.workers.dev,2026-10-24:${encodeURI(e.id)}`)}</id><title>${xml(e.title)}</title><link rel="alternate" href="${xml(e.url)}"/><updated>${e.at}</updated></entry>`).join("") +
    `</feed>`;
  return doc(body, "application/atom+xml; charset=utf-8", 200, 300);
}
