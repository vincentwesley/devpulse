> Update at the end of any session that changed state. Keep it lean.

Continue work on **DevPulse** (local only, no GitHub repo yet, not deployed).
Handover 2026-10-09: M0-M4 code done and verified locally against fixtures (typecheck, 33 vitest, playwright+axe, build). Security-reviewed. Nothing has run against live GitHub/Cloudflare. Only do what the owner asks.

## Before anything
1. Work in `C:\Coding Projects\devpulse`. Read `docs/PLAN.md` in full.
2. Do not create a GitHub repo or change visibility without an OK (new repos start private).

## How to work here
- Orchestrator rule: dispatch builders, don't write code inline. House rules in `../CLAUDE.md`.
- Node 24 (`eval "$(fnm env)" && fnm use 24`); if npm acts up, `export npm_config_userconfig=$(mktemp)`.
- Commands: see CLAUDE.md.
- GitHub token only as a Worker secret. Real data only; fixtures in tests only. Free tiers only.

## Current state
Worker: api router (`routes/{projects,github,posts,ingest}.ts`), cron (`cron.ts` dispatch: uptime every 15 min; hourly GitHub sync + RSS; daily prune), D1 migration `0001_init.sql`, weekly Lighthouse workflow + `scripts/lighthouse.mjs`. Frontend: project cards, D3 heatmap, commits, posts, credits card. Screenshots in `docs/screens/m1-*`.

## Needs the owner (do last, in order)
1. `npx wrangler login`; `npx wrangler d1 create devpulse`; paste the id into `wrangler.jsonc` `database_id`; `npx wrangler d1 migrations apply DB --remote`.
2. Create a fine-grained GitHub token (public repos, read-only; contents, actions, metadata). `npx wrangler secret put GITHUB_TOKEN`. Pick any random string for `INGEST_TOKEN` and `wrangler secret put INGEST_TOKEN`.
3. Set `PORTFOLIO_RSS_URL` (var in `wrangler.jsonc`); the portfolio may need `@astrojs/rss` first (change goes in the portfolio repo).
4. Add topic `devpulse` + a homepage URL to each repo to monitor (MetaLens, DueReminder, ...). Optional `.devpulse.json` `{ "deps": ["https://status-page"] }` in a repo.
5. `npx wrangler deploy`. Then push to a (private) GitHub repo, add Actions secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `INGEST_TOKEN` and variable `DEVPULSE_URL`.
6. After deploy: verify live data with `wrangler dev --test-scheduled` / the deployed site (M5), run Lighthouse workflow once via workflow_dispatch.

## Known gaps / ideas
1. `wrangler.jsonc` database_id is a placeholder; CI deploy job fails until secrets exist.
2. Live GitHub/Statuspage/RSS behaviour untested (fixtures only); expect small fixes on first real run.
3. Repo discovery uses `/users/{owner}/repos` (public repos only).
4. lighthouse is pinned at 13.0.1 (latest 13.5.0).

Report outcomes tersely.
