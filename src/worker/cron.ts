import type { Env } from "./env";
import { checkAlerts } from "./alerts";
import { githubTick } from "./github";
import { beat, errCode, persistExpiry } from "./lib/jobs";
import { retryLoc, syncLoc } from "./loc";
import { pruneChecks } from "./prune";
import { runPsi } from "./psi";
import { syncPosts } from "./posts";
import { runShots, type Launch } from "./shots";
import { runProbes } from "./sites";
import { runUptime, slotOf } from "./uptime";

// Logs the error CODE only (messages can carry private repo names) and records a heartbeat in `jobs`.
const run = (env: Env, name: string, fn: () => Promise<void>) =>
  fn().then(() => beat(env.DB, name), (e) => { const c = errCode(e); console.error(`cron ${name} failed: ${c}`); return beat(env.DB, name, c); });

// One cron, every 15 min. Free plan caps an invocation at 50 subrequests (and 50 D1 queries; a batch counts as one), so heavy jobs own their slot;
// tests/unit/budget.test.ts walks a whole week of slots (500 repos, 60 sites) and proves the cap.
//   00:30 UTC daily  -> LOC: 1 private-repo list + <= CODEFREQ_MAX code_frequency calls (nothing else runs)
//   Mon 01:00 UTC    -> PSI: <= MAX_SITES calls, rotating by week past 30 sites (nothing else runs)
//   every other slot -> GitHub list pass (<= MAX_LIST_PAGES; create/rename/archive/delete land here) + detail pass (<= DETAIL_CALLS),
//                       then uptime (<= MAX_SITES, rotating by slot past 30 sites); 00:00 also the heatmap (1) and prune
//   hourly (:00)     -> + posts (1) + statuspages (<= MAX_STATUS_ORIGINS)
//   :15/:30/:45      -> + LOC retry (<= LOC_RETRY_MAX) + live-site probes (<= PROBES_PER_SLOT) + one Browser Run session (<= SHOTS_PER_SLOT shots)
// Owner rule: README/showcase data (detail pass) and screenshots refresh at most once a day per repo, and only after the repo changed.
// Every slot ends with the alert check and token-expiry persist (D1 only, no subrequests besides the email binding).
export async function runScheduled(event: ScheduledController, env: Env, launch?: Launch): Promise<void> {
  const d = new Date(event.scheduledTime);
  const [h, m] = [d.getUTCHours(), d.getUTCMinutes()];
  const hourly = m === 0;
  const jobs: Promise<void>[] = [];
  if (h === 0 && m === 30) jobs.push(run(env, "loc", () => syncLoc(env)));
  else if (d.getUTCDay() === 1 && h === 1 && m === 0) jobs.push(run(env, "psi", () => runPsi(env, d)));
  else {
    // Uptime, probes, shots and the LOC retry run after the GitHub step: they see renamed repos and never write under an old name.
    jobs.push(run(env, "github", () => githubTick(env, d)).then(() => Promise.all([
      run(env, "uptime", () => runUptime(env, hourly, slotOf(+d))),
      ...(hourly ? [] : [
        retryLoc(env, d).catch((e) => console.error(`loc retry failed: ${errCode(e)}`)),
        run(env, "probe", () => runProbes(env, d)),
        run(env, "shots", () => runShots(env, d, launch)),
      ]),
    ]).then(() => {})));
    if (hourly) {
      jobs.push(run(env, "posts", () => syncPosts(env)));
      if (h === 0) jobs.push(run(env, "prune", () => pruneChecks(env)));
    }
  }
  await Promise.all(jobs);
  await persistExpiry(env.DB);
  await checkAlerts(env);
}
