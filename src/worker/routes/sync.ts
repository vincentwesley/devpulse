import type { Env } from "../env";
import { doc, json } from "../lib/http";
import { loadProjects, type Project } from "./projects";

// Sheet-sync view: a stable, compact public listing for a reader that can only fetch and summarise text. Public repos only (the `projects` table).
export const COLUMNS = ["sheetId", "repo", "url", "stage", "lastPush", "ci", "uptime30d", "release", "created", "checked", "stale", "gaps"] as const;
const STAGE_KEY = [
  "stages: archived > live-down (site failing/open incident) > live-up > live-pending (site not checked yet) > released-extension (extension with a release) > active (push < 30 d) > quiet (no push 30+ d)",
  "stale: yes = list pass > 45 min old, site check overdue, or a detected change not read within its daily slot + 2 h",
  "gaps: readme (no real explanation), screenshot, about (no description), website (no Website field), topics",
];
const day = (s: string | null) => (s ? s.slice(0, 10) : null);
const minute = (s: string | null) => (s ? s.slice(0, 16) + "Z" : null);
const ci = (s: string | null) => (!s ? "none" : s === "SUCCESS" ? "success" : s === "FAILURE" || s === "ERROR" ? "failure" : "pending");

/** One flat row per repo, values as they appear in every format ("-" = empty). */
export const rowOf = (p: Project): Record<(typeof COLUMNS)[number], string> => ({
  sheetId: p.sheetId ?? "-", repo: p.name, url: p.url ?? "-", stage: p.stage, lastPush: day(p.pushedAt) ?? "-", ci: ci(p.ciState),
  uptime30d: p.uptime30d == null ? "-" : `${p.uptime30d}%`, release: p.release?.tag ?? "-", created: day(p.createdAt) ?? "-",
  checked: minute(p.checkedAt) ?? "-", stale: p.stale ? `yes (${p.staleWhy.join(",")})` : "no", gaps: p.audit.length ? p.audit.join(",") : "-",
});
const sorted = (ps: Project[]) => [...ps].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
const cell = (s: string) => s.replace(/[\r\n|]+/g, " ").trim() || "-";
// Formula guard for spreadsheet imports (a release tag like "=1+1"), then RFC 4180 quoting.
const csv = (v: string) => { const s = /^[=+@\t\r]|^-./.test(v) ? `'${v}` : v; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function renderMd(ps: Project[], origin: string, at: string): string {
  const rows = sorted(ps).map(rowOf);
  return [
    "# DevPulse sheet sync",
    `generated: ${at}`,
    `source: ${origin}/sync.json (same data: ${origin}/sync.csv; README snippets: ${origin}/sync/snippets.md)`,
    `public repos: ${rows.length} · live: ${ps.filter((p) => p.url).length} · stale: ${ps.filter((p) => p.stale).length}`,
    `columns: ${COLUMNS.join(" | ")}`,
    "",
    ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(" | ")),
    "",
    ...STAGE_KEY,
    "",
  ].join("\n");
}

export function renderCsv(ps: Project[], at: string): string {
  return [[...COLUMNS, "generatedAt"].join(","), ...sorted(ps).map(rowOf).map((r) => [...COLUMNS.map((c) => csv(r[c])), at].join(","))].join("\r\n") + "\r\n";
}

export function renderSnippets(ps: Project[], at: string): string {
  return [`# DevPulse README snippets`, `generated: ${at}`, "", ...sorted(ps).flatMap((p) => [`## ${p.name}`, "", "```markdown", p.snippet, "```", ""])].join("\n");
}

/** GET|HEAD /sync.md (text/plain so fetch tools show it raw), /sync.json, /sync.csv, /sync/snippets.md. Edge-cached 5 min. */
export async function route(req: Request, env: Env, pathname: string): Promise<Response | null> {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  if (!["/sync.md", "/sync.json", "/sync.csv", "/sync/snippets.md"].includes(pathname)) return null;
  const origin = new URL(req.url).origin, at = new Date().toISOString().slice(0, 19) + "Z";
  const ps = await loadProjects(env, origin);
  const body = (r: Response) => (req.method === "HEAD" ? new Response(null, { status: r.status, headers: r.headers }) : r);
  if (pathname === "/sync.json") {
    return body(json({
      generatedAt: at, source: `${origin}/sync.json`, columns: COLUMNS,
      repos: sorted(ps).map((p) => ({ ...rowOf(p), stale: p.stale, staleWhy: p.staleWhy, gaps: p.audit, checkedAt: p.checkedAt, pushedAt: p.pushedAt, createdAt: p.createdAt, uptimeAt: p.uptimeAt, detailAt: p.detailAt, urlSource: p.urlSource, archived: p.archived, card: `${origin}/card/${p.name}.svg`, shot: `${origin}/shot/${p.name}.jpg`, page: `${origin}/p/${p.name}`, snippet: p.snippet, audit: p.audit })),
    }, 200, 300));
  }
  if (pathname === "/sync.csv") return body(doc(renderCsv(ps, at), "text/csv; charset=utf-8", 200, 300));
  if (pathname === "/sync/snippets.md") return body(doc(renderSnippets(ps, at), "text/plain; charset=utf-8", 200, 300));
  return body(doc(renderMd(ps, origin, at), "text/plain; charset=utf-8", 200, 300));
}
