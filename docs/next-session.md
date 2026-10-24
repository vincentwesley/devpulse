> Update at the end of any session that changed state. Keep it lean.

Continue work on **DevPulse**, the public project hub. Deployed 2026-10-21 (version 0d408649, rollback 108468fb) at devpulse.vincentwesleybiz.workers.dev. Repo is still private; 4 local commits are unpushed. Only do what the owner asks.

## Before anything
1. Work in the repo root. Read `docs/PLAN.md`.
2. Do not change visibility or push without an OK. Pre-public gate is green (`check-identity.sh --public`, review fixes done); the owner's final OK is pending.

## How to work here
- Orchestrator rule: dispatch builders, don't write code inline. House rules in `../CLAUDE.md`.
- Node 24. The Bash tool breaks on `cd` (fnm); use PowerShell with `fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression; fnm use 24`.
- Commands: see CLAUDE.md. Headless e2e only; no visible browser.
- GitHub token only as a Worker secret. Real data only; fixtures in tests only. Free tiers only. No Actions minutes: verify locally, deploy with `npx wrangler deploy` (migrate first: `npx wrangler d1 migrations apply DB --remote`).

## Current state
Worker: GraphQL sync (`github.ts`, up to 50 repos), cron (`cron.ts`: uptime 15 min; hourly sync + RSS + statuspages; 00:00 prune; 00:30 LOC `loc.ts`; Mon 01:00 PageSpeed `psi.ts`). Routes: projects/github/posts/stats, `/api/status` (90d strips + incidents), `/feed.xml` (Atom), `/badge/:name.svg`, `/card/:name.svg` (unknown names are `no-store`). Per-IP rate limit via binding `RL` (60 req/10s). Migrations 0001-0004 (0003 = rollup tables, 0004 = backfill from `checks`, idempotent); 0001-0002 applied remotely, 0003-0004 NOT yet. Frontend: hero counters, languages bar, hub cards with sort/filter + detail dialog, status section, activity feed, heatmap, command palette, service worker (`src/web/sw.js`, network-first API + offline banner), motion. 113 unit + 20 e2e green (local, headless).
Live check 2026-10-21: projects, stats, languages, badges return real data. LOC is 0 until the first 00:30 UTC run; posts empty (no RSS URL).

## Deploy order
1. `npx wrangler d1 migrations apply DB --remote` BEFORE deploying (the new code reads `uptime_summary`/`daily_uptime`/`incidents`).
2. `ratelimits` `namespace_id` "1001" in `wrangler.jsonc` must be unused on the Cloudflare account; change it if another Worker owns it.
3. `npx wrangler deploy`. Rollback: previous version id above.

## Needs the owner (do last)
1. Regenerate `GITHUB_TOKEN`: fine-grained, All repositories, read-only Metadata, Contents, Commit statuses, Checks; `npx wrangler secret put GITHUB_TOKEN`. Until then only public repos are counted.
2. GitHub profile: enable "Include private contributions" for the heatmap.
3. `npx wrangler secret delete INGEST_TOKEN`; remove the Actions secret.
4. Optional: `PSI_KEY` secret, `PORTFOLIO_RSS_URL`, repo "Website" fields for uptime, `.devpulse.json` deps.
5. OK to make the repo public and push once (milestone push).

## Known gaps / ideas
1. Repos beyond 50 are dropped; LOC covers 45 repos/day with rotation.
2. Deps status empty until a repo has `.devpulse.json`.
3. The unused `ci` table can be dropped in a later migration.
4. No screenshots taken for the new UI (needs owner OK for visual checks).

Report outcomes tersely.
