import type { Env } from "./env";
import { syncGithub } from "./github";
import { pruneChecks } from "./prune";
import { syncPosts } from "./posts";
import { runUptime } from "./uptime";

const run = (name: string, fn: () => Promise<void>) =>
  fn().catch((e) => console.error(`cron ${name} failed:`, e instanceof Error ? e.message : String(e)));

// Cron fires every 15 min: uptime always. Hourly (minute 0): GitHub + posts + statuspages. Daily (00:00 UTC): prune.
// Free plan caps an invocation at 50 subrequests. Worst hourly tick, MAX_REPOS=10:
//   github 2 (repo pages) + 3*10 (contents, runs, commits) + 1 (graphql, daily) = 33
//   posts 1 + uptime 10 project checks + statuspages (<= ~6 distinct origins) = ~50.
// Keep MAX_REPOS small; raise it only after splitting crons per cadence.
export async function runScheduled(event: ScheduledController, env: Env): Promise<void> {
  const d = new Date(event.scheduledTime);
  const hourly = d.getUTCMinutes() === 0;
  const tasks = [run("uptime", () => runUptime(env, hourly))];
  if (hourly) {
    tasks.push(run("github", () => syncGithub(env)), run("posts", () => syncPosts(env)));
    if (d.getUTCHours() === 0) tasks.push(run("prune", () => pruneChecks(env)));
  }
  await Promise.all(tasks);
}
