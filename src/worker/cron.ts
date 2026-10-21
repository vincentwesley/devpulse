import type { Env } from "./env";
import { syncGithub } from "./github";
import { syncLoc } from "./loc";
import { pruneChecks } from "./prune";
import { runPsi } from "./psi";
import { syncPosts } from "./posts";
import { runUptime } from "./uptime";

const run = (name: string, fn: () => Promise<void>) =>
  fn().catch((e) => console.error(`cron ${name} failed:`, e instanceof Error ? e.message : String(e)));

// One cron, every 15 min. Free plan caps an invocation at 50 subrequests (and 50 D1 queries), so heavy jobs own their slot;
// tests/unit/budget.test.ts walks a whole week of slots and proves the cap.
//   00:30 UTC daily  -> LOC: 1 private-repo list + <= CODEFREQ_MAX code_frequency calls (uptime skipped this once a day)
//   Mon 01:00 UTC    -> PSI: <= MAX_SITES calls (rest of the hourly work skipped this once a week)
//   otherwise        -> uptime (<= MAX_SITES); hourly also GitHub (<= 3 GraphQL + 1 heatmap), posts (1), statuspages (<= MAX_STATUS_ORIGINS); 00:00 prunes
export async function runScheduled(event: ScheduledController, env: Env): Promise<void> {
  const d = new Date(event.scheduledTime);
  const [h, m] = [d.getUTCHours(), d.getUTCMinutes()];
  if (h === 0 && m === 30) return run("loc", () => syncLoc(env));
  if (d.getUTCDay() === 1 && h === 1 && m === 0) return run("psi", () => runPsi(env, d));
  const hourly = m === 0;
  const tasks = [run("uptime", () => runUptime(env, hourly))];
  if (hourly) {
    tasks.push(run("github", () => syncGithub(env, d)), run("posts", () => syncPosts(env)));
    if (h === 0) tasks.push(run("prune", () => pruneChecks(env)));
  }
  await Promise.all(tasks);
}
