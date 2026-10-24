import type { Env } from "./env";
import { RETENTION_DAYS } from "./config";
import { isoWeek } from "./psi";

const GRACE_S = 7 * 86400; // a repo that left `projects` keeps its history this long (a transient GitHub gap or a rename mishap is recoverable)

export async function pruneChecks(env: Env): Promise<void> {
  const t = Math.floor(Date.now() / 1000), cutoff = t - RETENTION_DAYS * 86400;
  // Orphan = not in projects AND not monitored in the last 7 days (uptime_summary.updated_at stops moving when the repo leaves projects).
  // ponytail: lighthouse rows exist only for sites, which always have a summary row, so the same clock covers them.
  const orphan = (col: string) => env.DB.prepare(`DELETE FROM ${col} WHERE project NOT IN (SELECT repo FROM projects) AND project NOT IN (SELECT project FROM uptime_summary WHERE updated_at >= ?)`).bind(t - GRACE_S);
  await env.DB.batch([
    // Stale open incidents (site no longer monitored) would show as "ongoing" forever: close them first.
    env.DB.prepare("UPDATE incidents SET end_ts = ? WHERE end_ts IS NULL AND project NOT IN (SELECT project FROM uptime_summary WHERE updated_at >= ?)").bind(t, t - GRACE_S),
    env.DB.prepare("DELETE FROM checks WHERE ts < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM daily_uptime WHERE date < ?").bind(new Date(cutoff * 1000).toISOString().slice(0, 10)),
    env.DB.prepare("DELETE FROM incidents WHERE end_ts IS NOT NULL AND end_ts < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM lighthouse WHERE week < ?").bind(isoWeek(new Date(cutoff * 1000))),
    ...["checks", "daily_uptime", "incidents", "lighthouse"].map(orphan),
    env.DB.prepare("DELETE FROM uptime_summary WHERE updated_at < ?").bind(t - GRACE_S), // sites no longer monitored
    env.DB.prepare("DELETE FROM repo_alias WHERE repo NOT IN (SELECT repo FROM projects)"),
  ]);
}
