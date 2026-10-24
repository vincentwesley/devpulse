import type { Env } from "./env";
import { RETENTION_DAYS } from "./config";

export async function pruneChecks(env: Env): Promise<void> {
  const t = Math.floor(Date.now() / 1000), cutoff = t - RETENTION_DAYS * 86400;
  await env.DB.batch([
    // Stale open incidents (site no longer monitored) would show as "ongoing" forever: close them first.
    env.DB.prepare("UPDATE incidents SET end_ts = ? WHERE end_ts IS NULL AND project NOT IN (SELECT project FROM uptime_summary WHERE updated_at >= ?)").bind(t, t - 7 * 86400),
    env.DB.prepare("DELETE FROM checks WHERE ts < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM daily_uptime WHERE date < ?").bind(new Date(cutoff * 1000).toISOString().slice(0, 10)),
    env.DB.prepare("DELETE FROM incidents WHERE end_ts IS NOT NULL AND end_ts < ?").bind(cutoff),
    env.DB.prepare("DELETE FROM uptime_summary WHERE updated_at < ?").bind(t - 7 * 86400), // sites no longer monitored
  ]);
}
