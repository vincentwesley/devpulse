// Cron heartbeats, token expiry and health math. Error CODES only, never messages (they can carry private repo names).
export type ErrCode = "auth" | "rate" | "http" | "parse" | "budget" | "unknown";

export class JobError extends Error {
  constructor(public code: ErrCode, message: string = code) { super(message); }
}
export const errCode = (e: unknown): ErrCode =>
  e instanceof JobError ? e.code : e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError" || e instanceof TypeError) ? "http" : "unknown";

/** Token expiry seen on the latest GitHub response this invocation. undefined = none seen, null = header absent/malformed. */
export const seen: { expiry: number | null | undefined } = { expiry: undefined };

/** `GitHub-Authentication-Token-Expiration: 2026-12-31 12:00:00 UTC` -> unix seconds, or null if absent/malformed/implausible. */
export function parseExpiry(h: string | null | undefined): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\s*(?:UTC|Z))?$/.exec((h ?? "").trim());
  const ms = m ? Date.parse(`${m[1]}T${m[2]}Z`) : NaN;
  return Number.isFinite(ms) && ms > Date.UTC(2020, 0, 1) && ms < Date.UTC(2100, 0, 1) ? Math.floor(ms / 1000) : null;
}
export const noteExpiry = (r: Response) => { seen.expiry = parseExpiry(r.headers.get("GitHub-Authentication-Token-Expiration")); };

const now = () => Math.floor(Date.now() / 1000);

export async function beat(db: D1Database, job: string, err?: ErrCode): Promise<void> {
  try {
    await (err
      ? db.prepare("INSERT INTO jobs (job,last_err_code,last_err_at) VALUES (?1,?2,?3) ON CONFLICT(job) DO UPDATE SET last_err_code=?2, last_err_at=COALESCE(last_err_at,?3)").bind(job, err, now())
      : db.prepare("INSERT INTO jobs (job,last_ok) VALUES (?1,?2) ON CONFLICT(job) DO UPDATE SET last_ok=?2, last_err_code=NULL, last_err_at=NULL").bind(job, now())).run();
  } catch { /* a heartbeat must never break the job */ }
}

/** Persist the token expiry seen this run (null clears it, e.g. a non-expiring token replaced an old one). */
export async function persistExpiry(db: D1Database): Promise<void> {
  const e = seen.expiry;
  seen.expiry = undefined;
  if (e === undefined) return;
  try {
    await (e === null ? db.prepare("DELETE FROM meta WHERE key='token_exp'") : db.prepare("INSERT INTO meta (key,value) VALUES ('token_exp',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(e))).run();
  } catch {}
}

export interface JobRow { job: string; last_ok: number | null; last_err_code: string | null; last_err_at: number | null; alerted_at: number | null }
export const GITHUB_STALE_S = 3 * 3600, UPTIME_STALE_S = 45 * 60, TOKEN_WARN_DAYS = 14;

/** Unix time the job went stale (failing, or silent, for longer than `limit` seconds), or null while healthy / unknown. */
export function staleSince(j: JobRow | undefined, limit: number, t = now()): number | null {
  if (!j) return null;
  if (j.last_err_at != null && t - j.last_err_at > limit) return j.last_ok ?? j.last_err_at;
  if (j.last_ok != null && t - j.last_ok > limit) return j.last_ok;
  return null;
}

export const daysLeft = (exp: string | null | undefined, t = now()) => (exp && Number.isFinite(+exp) ? Math.floor((+exp - t) / 86400) : null);

export function computeHealth(rows: JobRow[], exp: string | null | undefined, t = now()) {
  const by = new Map(rows.map((r) => [r.job, r]));
  const since = [staleSince(by.get("github"), GITHUB_STALE_S, t), staleSince(by.get("uptime"), UPTIME_STALE_S, t)].filter((x): x is number => x != null);
  return {
    stale: since.length > 0,
    since: since.length ? new Date(Math.min(...since) * 1000).toISOString() : null,
    tokenDaysLeft: daysLeft(exp, t),
    jobs: Object.fromEntries(rows.map((r) => [r.job, { ageMin: r.last_ok == null ? null : Math.max(0, Math.floor((t - r.last_ok) / 60)), ok: r.last_err_code == null && r.last_ok != null }])),
  };
}
