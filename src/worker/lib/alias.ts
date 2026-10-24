import type { Env } from "../env";

/** Canonical project name for a requested one: case-insensitive match, else a renamed repo's old name via repo_alias. Null = unknown. */
export async function canonicalName(env: Env, name: string): Promise<string | null> {
  const r = await env.DB.prepare(
    "SELECT name FROM projects WHERE name = ?1 COLLATE NOCASE UNION ALL SELECT p.name FROM repo_alias a JOIN projects p ON p.repo = a.repo WHERE a.old_name = ?1 COLLATE NOCASE LIMIT 1",
  ).bind(name).first<{ name: string }>();
  return r?.name ?? null;
}
