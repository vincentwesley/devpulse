import { isHttps } from "../worker/lib/github-parse";

export type Res<T> = { state: "ok"; data: T } | { state: "empty" } | { state: "error" };

export interface Project {
  repo: string; name: string; url: string; up: boolean | null; uptime30d: number | null; latencyMs: number[];
  ci: { status: string; conclusion: string | null; url: string } | null;
  lighthouse: { week: string; performance: number; accessibility: number; best_practices: number; seo: number } | null;
  deps: { url: string; name: string; indicator: string }[];
}
export interface Commit { repo: string; sha: string; message: string; author: string; ts: string; url: string }
export const NODATA = "no data yet";
/** ISO timestamp -> YYYY-MM-DD. */
export const fmtDate = (s: string) => s.slice(0, 10);
export interface Post { title: string; url: string; published: string }
export interface Heat { days: { date: string; count: number }[] }

async function get<T>(path: string, isEmpty: (d: T) => boolean): Promise<Res<T>> {
  try {
    const r = await fetch(path);
    if (!r.ok) return { state: "error" };
    const data = (await r.json()) as T;
    return data == null || isEmpty(data) ? { state: "empty" } : { state: "ok", data };
  } catch {
    return { state: "error" };
  }
}
const noItems = (a: unknown[]) => !Array.isArray(a) || a.length === 0;

export const getProjects = () => get<Project[]>("/api/projects", noItems);
export const getCommits = () => get<Commit[]>("/api/commits", noItems);
export const getPosts = () => get<Post[]>("/api/posts", noItems);
export const getHeatmap = () => get<Heat>("/api/heatmap", (h) => noItems(h.days));

/** Create an element with text (textContent only) and optional class / attrs. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = "", attrs: Record<string, string> = {}) {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
/** appendChild loop: the workers-types Element.append overload shadows the DOM one. */
export const add = (p: Node, ...kids: (Node | string)[]) => {
  for (const k of kids) p.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
};
export const link = (text: string, href: string, cls = "") =>
  isHttps(href) ? el("a", text, cls, { href, target: "_blank", rel: "noopener noreferrer" }) : el("span", text, cls);

/** Replace the section body (everything after the h2) with the built node, or the empty/error message. */
export function show<T>(sectionId: string, res: Res<T>, build: (d: T) => HTMLElement) {
  const sec = document.getElementById(sectionId)!;
  sec.querySelectorAll(":scope > .body, :scope > .empty").forEach((e) => e.remove());
  if (res.state === "ok") {
    const b = build(res.data);
    b.classList.add("body");
    add(sec, b);
  } else {
    add(sec, el("p", res.state === "empty" ? NODATA : "couldn't load", `empty${res.state === "error" ? " empty--err" : ""}`, { role: "status" }));
  }
}
