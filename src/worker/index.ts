import { handleApi } from "./api";
import { runScheduled } from "./cron";
import type { Env } from "./env";

export default {
  fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/") || pathname.startsWith("/badge/") || pathname.startsWith("/card/") || pathname.startsWith("/img/") || pathname.startsWith("/p/") || pathname.startsWith("/shot/") || pathname.startsWith("/sync") || pathname === "/grid.svg" || pathname === "/feed.xml") return handleApi(req, env);
    return env.ASSETS.fetch(req);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(event, env));
  },
} satisfies ExportedHandler<Env>;
