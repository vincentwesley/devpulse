> Update at the end of any session that changed state. Keep it lean.

Continue work on **DevPulse** (local only, no GitHub repo yet, not deployed).
Handover 2026-10-09: M0-M4 code done and verified locally (typecheck, 37 vitest, playwright+axe, build). Security-reviewed. Worker smoke-tested locally with wrangler dev (cron, all routes, Lighthouse run). Simplify + code-review done. Nothing has run against live GitHub/Cloudflare/RSS. Only do what the owner asks.

## Before anything
1. Work in the repo root. Read `docs/PLAN.md` in full.
2. Do not create a GitHub repo or change visibility without an OK (new repos start private).

## How to work here
- Orchestrator rule: dispatch builders, don't write code inline. House rules in `../CLAUDE.md`.
- Node 24 (`eval "$(fnm env)" && fnm use 24`); if npm acts up, `export npm_config_userconfig=$(mktemp)`.
- Commands: see CLAUDE.md.
- GitHub token only as a Worker secret. Real data only; fixtures in tests only. Free tiers only.

## Current state
Worker: api router (`routes/{projects,github,posts,stats,badge}.ts`), cron (`cron.ts` dispatch: uptime every 15 min; hourly GitHub sync + RSS; daily prune), D1 migration `0001_init.sql`, weekly PageSpeed Insights Lighthouse in the Worker cron (`psi.ts`), daily LOC (`loc.ts`), migration `0002_hub.sql`. Frontend: project cards, D3 heatmap, commits, posts, credits card. Screenshots in `docs/screens/m1-*`.

## Needs the owner (do last, in order)
1. `npx wrangler login`; `npx wrangler d1 create devpulse`; paste the id into `wrangler.jsonc` `database_id`;
2. Create a fine-grained GitHub token: **All repositories** (for private aggregates), read-only Metadata, Contents, Commit statuses, Checks (needed for `ci_state`). `npx wrangler secret put GITHUB_TOKEN`. Optional: `npx wrangler secret put PSI_KEY` (PageSpeed Insights).
3. Set `PORTFOLIO_RSS_URL` (var in `wrangler.jsonc`); the portfolio may need `@astrojs/rss` first (change goes in the portfolio repo).
4. Repos are auto-discovered (public, non-fork, non-archived, newest 50). Set the repo "Website" (https) to enable uptime; topic `devpulse-ignore` hides one. Optional `.devpulse.json` `{ "deps": ["https://status-page"] }` in a repo.
5. `npx wrangler d1 migrations apply DB --remote` BEFORE `npx wrangler deploy`. Then push to a (private) GitHub repo, add Actions secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
6. After deploy: verify live data with `wrangler dev --test-scheduled` / the deployed site (M5); Lighthouse now runs in the Worker cron (Mon 01:00 UTC, PageSpeed Insights).

## Known gaps / ideas
1. `wrangler.jsonc` database_id is a placeholder; CI deploy job fails until secrets exist.
2. Live GitHub/Statuspage/RSS behaviour untested (fixtures only); expect small fixes on first real run.
3. Repo discovery uses `/users/{owner}/repos` (public repos only).
4. MAX_REPOS=10 (free-plan 50-subrequest cap; split crons per cadence before raising). Skipped: GraphQL batching of per-repo calls, route-table rewrite, shared CI composite action.

Report outcomes tersely.
