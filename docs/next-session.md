> Update at the end of any session that changed state. Keep it lean.

Continue work on **DevPulse** (local only, no GitHub repo yet, not deployed).
Handover 2026-10-09: M0 code scaffold done and verified locally (typecheck, vitest, playwright+axe, build). Not deployed. Only do what the owner asks.

## Before anything
1. Work in `C:\Coding Projects\devpulse`. Read `docs/PLAN.md` in full.
2. Confirm owner prerequisites before M1: fine-grained read-only GitHub token (public repos); `devpulse` topic + homepage URL on each repo to monitor; portfolio RSS URL; `wrangler login` done.
3. Do not create a GitHub repo or change visibility without an OK (new repos start private).

## How to work here
- Orchestrator rule: dispatch builders, don't write code inline. House rules in `../CLAUDE.md`.
- Node 24 (`eval "$(fnm env)" && fnm use 24`); if npm acts up, `export npm_config_userconfig=$(mktemp)`.
- Commands: see CLAUDE.md.
- GitHub token only as a Worker secret. Real data only; fixtures in tests only. Free tiers only.

## Current state
M0 scaffold: Worker (api router, cron dispatch, empty stubs github/uptime/posts/prune), D1 migration, Vite frontend with empty states, house kit, credits card, CI + deploy job, screenshots in `docs/screens/m0-*`. Next: owner creates D1 + secrets + deploys; then M1.

## Known gaps / ideas
1. `wrangler.jsonc` database_id is a placeholder; CI deploy job fails until secrets exist.
2. Portfolio may need `@astrojs/rss` (M4, change goes in the portfolio repo).

Report outcomes tersely.
