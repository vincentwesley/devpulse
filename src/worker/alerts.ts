import { EmailMessage } from "cloudflare:email";
import type { Env } from "./env";
import { daysLeft, GITHUB_STALE_S, staleSince, TOKEN_WARN_DAYS, UPTIME_STALE_S, type JobRow } from "./lib/jobs";

/** Hand-built RFC 5322 text message. Bodies are fixed strings plus a time or a count: no repo names ever. */
async function send(env: Env, subject: string): Promise<boolean> {
  const to = env.ALERT_TO?.trim(), from = env.ALERT_FROM?.trim();
  if (!env.ALERT || !to || !from || /[\r\n<>]/.test(to + from)) return false; // missing binding / secret = silent no-op
  const raw = [`From: DevPulse <${from}>`, `To: ${to}`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@${from.split("@")[1]}>`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", subject, ""].join("\r\n");
  try { await env.ALERT.send(new EmailMessage(from, to, raw)); return true; } catch { return false; }
}

const hhmm = (s: number) => new Date(s * 1000).toISOString().slice(11, 16);

/**
 * One email when a condition starts (jobs.alerted_at dedupes), one when it clears. Never throws: alerts must not break cron.
 * ponytail: github/uptime state lives in `jobs`, the token alert in meta('token_alerted'); a failed send is retried next slot.
 */
export async function checkAlerts(env: Env, nowMs = Date.now()): Promise<void> {
  if (!env.ALERT || !env.ALERT_TO) return;
  try {
    const t = Math.floor(nowMs / 1000), db = env.DB;
    const [jobs, meta] = (await db.batch([db.prepare("SELECT job, last_ok, last_err_code, last_err_at, alerted_at FROM jobs"), db.prepare("SELECT key, value FROM meta WHERE key IN ('token_exp','token_alerted')")])) as { results: any[] }[];
    const by = new Map((jobs.results as JobRow[]).map((j) => [j.job, j]));
    const m = new Map(meta.results.map((r: { key: string; value: string }) => [r.key, r.value]));
    for (const [job, label, limit] of [["github", "GitHub sync", GITHUB_STALE_S], ["uptime", "uptime checks", UPTIME_STALE_S]] as const) {
      const row = by.get(job), since = staleSince(row, limit, t);
      if (since != null && !row?.alerted_at && (await send(env, `DevPulse: ${label} stale since ${hhmm(since)} UTC`))) await db.prepare("UPDATE jobs SET alerted_at=? WHERE job=?").bind(t, job).run();
      else if (since == null && row?.alerted_at && (await send(env, `DevPulse: ${label} recovered`))) await db.prepare("UPDATE jobs SET alerted_at=NULL WHERE job=?").bind(job).run();
    }
    const left = daysLeft(m.get("token_exp"), t), warned = m.has("token_alerted");
    if (left != null && left <= TOKEN_WARN_DAYS && !warned && (await send(env, `DevPulse: GitHub token expires in ${Math.max(left, 0)} days`)))
      await db.prepare("INSERT INTO meta (key,value) VALUES ('token_alerted',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(t)).run();
    else if ((left == null || left > TOKEN_WARN_DAYS) && warned && (await send(env, "DevPulse: GitHub token renewed")))
      await db.prepare("DELETE FROM meta WHERE key='token_alerted'").run();
  } catch (e) {
    console.error("alerts failed:", e instanceof Error ? e.name : "unknown");
  }
}
