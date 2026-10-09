import type { Env } from "./env";
import { syncGithub } from "./github";
import { pruneChecks } from "./prune";
import { syncPosts } from "./posts";
import { runUptime } from "./uptime";

// Cron fires every 15 min: uptime always; hourly (minute 0) GitHub + posts; daily (00:00 UTC) prune.
export async function runScheduled(event: ScheduledController, env: Env): Promise<void> {
  const d = new Date(event.scheduledTime);
  const tasks = [runUptime(env)];
  if (d.getUTCMinutes() === 0) tasks.push(syncGithub(env), syncPosts(env));
  if (d.getUTCMinutes() === 0 && d.getUTCHours() === 0) tasks.push(pruneChecks(env));
  await Promise.allSettled(tasks);
}
