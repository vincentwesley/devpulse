import type { Env } from "./env";
import { SHOT_DAILY_MS, SHOT_MAX_BYTES, SHOT_MIN_BYTES, SHOT_MIN_GAP_S, SHOTS_PER_SLOT } from "./config";

// The slice of @cloudflare/puppeteer used here; tests inject a fake launcher.
export interface ShotPage { setViewport(v: { width: number; height: number }): Promise<unknown>; goto(url: string, o: { waitUntil: "networkidle2"; timeout: number }): Promise<unknown>; screenshot(o: { type: "jpeg"; quality: number }): Promise<Uint8Array>; close(): Promise<unknown> }
export interface ShotBrowser { newPage(): Promise<ShotPage>; close(): Promise<unknown> }
export type Launch = (binding: Fetcher) => Promise<ShotBrowser>;
// Loaded lazily: only the cron path that actually shoots pulls in puppeteer.
const launchBrowser: Launch = async (b) => (await import("@cloudflare/puppeteer")).default.launch(b) as unknown as ShotBrowser;

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Non-hourly slots: <= SHOTS_PER_SLOT live sites in one Browser Run session, capped at SHOT_DAILY_MS of session time per UTC day.
 * Owner rule: shoot a site only if it was never shot, or it was pushed after the last shot AND that shot is >= SHOT_MIN_GAP_S old.
 * Unchanged sites keep their shot forever. A failed or near-blank capture keeps the previous image (tried_at throttles retries to daily).
 */
export async function runShots(env: Env, now = new Date(), launch: Launch = launchBrowser): Promise<void> {
  if (!env.BROWSER) return;
  const db = env.DB, t = Math.floor(+now / 1000), cut = t - SHOT_MIN_GAP_S, key = `shot_ms:${day(now)}`;
  const [used, pick] = (await db.batch([
    db.prepare("SELECT value FROM meta WHERE key=?").bind(key),
    db.prepare(
      "SELECT p.repo, p.name, p.url FROM projects p LEFT JOIN shots s ON s.repo = p.repo WHERE p.url IS NOT NULL AND (s.repo IS NULL OR (s.tried_at <= ?1 AND (s.taken_at IS NULL OR p.pushed_at > strftime('%Y-%m-%dT%H:%M:%SZ', s.taken_at, 'unixepoch')))) " +
      "ORDER BY s.taken_at IS NOT NULL, p.pushed_at DESC LIMIT ?2",
    ).bind(cut, SHOTS_PER_SLOT),
  ])) as { results: { value?: string; repo: string; name: string; url: string }[] }[];
  const spent = Number(used.results[0]?.value ?? 0);
  const sites = pick.results.slice(0, SHOTS_PER_SLOT);
  if (!sites.length || spent >= SHOT_DAILY_MS) return;
  const t0 = Date.now(), out: { repo: string; name: string; url: string; bytes: Uint8Array | null; ms: number }[] = [];
  const browser = await launch(env.BROWSER);
  try {
    for (const s of sites) {
      const s0 = Date.now();
      let bytes: Uint8Array | null = null;
      try {
        const page = await browser.newPage();
        try {
          await page.setViewport({ width: 1280, height: 800 });
          // A page that never goes network-idle (websockets, streaming) is still shot once the timeout hits; real navigation errors throw.
          await page.goto(s.url, { waitUntil: "networkidle2", timeout: 25_000 }).catch((e: Error) => { if (e?.name !== "TimeoutError") throw e; });
          const b = new Uint8Array(await page.screenshot({ type: "jpeg", quality: 75 }));
          bytes = b.byteLength >= SHOT_MIN_BYTES && b.byteLength <= SHOT_MAX_BYTES ? b : null;
        } finally { await page.close().catch(() => {}); }
      } catch { /* timeout / navigation error: keep the previous image */ }
      out.push({ ...s, bytes, ms: Date.now() - s0 });
    }
  } finally { await browser.close().catch(() => {}); }
  const ms = Date.now() - t0;
  await db.batch([
    ...out.map((o) => o.bytes
      ? db.prepare("INSERT INTO shots (repo,name,bytes,type,taken_at,tried_at,src,ms) VALUES (?1,?2,?3,'image/jpeg',?4,?4,?5,?6) ON CONFLICT(repo) DO UPDATE SET name=excluded.name,bytes=excluded.bytes,type=excluded.type,taken_at=excluded.taken_at,tried_at=excluded.tried_at,src=excluded.src,ms=excluded.ms")
        .bind(o.repo, o.name, o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength), t, o.url, o.ms)
      : db.prepare("INSERT INTO shots (repo,name,tried_at,src,ms) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(repo) DO UPDATE SET tried_at=excluded.tried_at").bind(o.repo, o.name, t, o.url, o.ms)),
    db.prepare("INSERT INTO meta (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+?2").bind(key, ms),
    db.prepare("DELETE FROM meta WHERE key LIKE 'shot_ms:%' AND key <> ?").bind(key),
  ]);
}
