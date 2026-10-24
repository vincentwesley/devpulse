import type { Env } from "./env";
import { checkAlerts } from "./alerts";
import { githubTick } from "./github";
import { beat, errCode, persistExpiry } from "./lib/jobs";
import { syncLoc } from "./loc";
import { pruneChecks } from "./prune";
import { runPsi } from "./psi";
import { syncPosts } from "./posts";
import { runUptime } from "./uptime";

// Logs the error CODE only (messages can carry private repo names) and records a heartbeat in `jobs`.
const run = (env: Env, name: string, fn: () => Promise<void>) =>
  fn().then(() => beat(env.DB, name), (e) => { const c = errCode(e); console.error(`cron ${name} failed: ${c}`); return beat(env.DB, name, c); });

// One cron, every 15 min. Free plan caps an invocation at 50 subrequests (and 50 D1 queries), so heavy jobs own their slot;
// tests/unit/budget.test.ts walks a whole week of slots and proves the cap.
//   00:30 UTC daily  -> LOC: 1 private-repo list + <= CODEFREQ_MAX code_frequency calls (uptime and the change check skipped this once a day)
//   Mon 01:00 UTC    -> PSI: <= MAX_SITES calls (rest of the work skipped this once a week)
//   hourly           -> uptime (<= MAX_SITES) + GitHub full sync (<= 3 GraphQL + 1 heatmap) + posts (1) + statuspages (<= MAX_STATUS_ORIGINS); 00:00 prunes
//   other :15/:30/:45 -> uptime + GitHub change check (1 GraphQL; a full sync only if the fingerprint moved: <= 1 + 3 + 1)
// Every slot ends with the alert check and token-expiry persist (D1 only, no subrequests besides the email binding).
export async function runScheduled(event: ScheduledController, env: Env): Promise<void> {
  const d = new Date(event.scheduledTime);
  const [h, m] = [d.getUTCHours(), d.getUTCMinutes()];
  const hourly = m === 0;
  const jobs: Promise<void>[] = [];
  if (h === 0 && m === 30) jobs.push(run(env, "loc", () => syncLoc(env)));
  else if (d.getUTCDay() === 1 && h === 1 && m === 0) jobs.push(run(env, "psi", () => runPsi(env, d)));
  else {
    jobs.push(run(env, "uptime", () => runUptime(env, hourly)), run(env, "github", () => githubTick(env, d, hourly)));
    if (hourly) {
      jobs.push(run(env, "posts", () => syncPosts(env)));
      if (h === 0) jobs.push(run(env, "prune", () => pruneChecks(env)));
    }
  }
  await Promise.all(jobs);
  await persistExpiry(env.DB);
  await checkAlerts(env);
}
