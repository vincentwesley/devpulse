import type { Env } from "./env";

export async function pruneChecks(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM checks WHERE ts < ?").bind(Math.floor(Date.now() / 1000) - 90 * 86400).run();
}
