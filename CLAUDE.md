# DevPulse

Public read-only dashboard of the health of vincentwesley's deployed projects: commits/heatmap, CI, uptime, weekly Lighthouse, dependency status, latest blog posts.

## Stack
One Cloudflare Worker (Workers Static Assets + `scheduled()` cron + `/api/*`), D1 storage, Vite + TypeScript frontend (plain DOM, D3 for charts only). Vitest, Playwright, axe.

## Rules
- Follows `../CLAUDE.md` house rules (orchestrator mode, dark default, `_house` kit, credits card at the bottom).
- GitHub token lives only in the Worker secret; the browser never sees a token.
- Real data only: no placeholder data in shipped features; fixtures in tests only. Empty state = "no data yet".
- Free tiers only.

## Commands (planned, not yet created)
`npm run dev` / `build` / `test` / `e2e`, `wrangler dev --test-scheduled`, `wrangler deploy`.

## Docs
Read `docs/PLAN.md` (architecture, milestones) and `docs/next-session.md` (handoff) first.
