import { handleApi } from "./api";
import { runScheduled } from "./cron";
import type { Env } from "./env";

export default {
  fetch(req, env) {
    if (new URL(req.url).pathname.startsWith("/api/")) return handleApi(req, env);
    return env.ASSETS.fetch(req);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(event, env));
  },
} satisfies ExportedHandler<Env>;
