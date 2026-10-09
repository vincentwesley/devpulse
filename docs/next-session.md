> Update at the end of any session that changed state. Keep it lean.

Continue work on **DevPulse** (local only, no GitHub repo yet, not deployed).
Handover 2026-10-09: planning done, docs-only scaffold committed, no code. Only do what the owner asks.

## Before anything
1. Work in `C:\Coding Projects\devpulse`. Read `docs/PLAN.md` in full.
2. Confirm owner prerequisites before M1: fine-grained read-only GitHub token (public repos); `devpulse` topic + homepage URL on each repo to monitor; portfolio RSS URL; `wrangler login` done.
3. Do not create a GitHub repo or change visibility without an OK (new repos start private).

## How to work here
- Orchestrator rule: dispatch builders, don't write code inline. House rules in `../CLAUDE.md`.
- Node 24 (`eval "$(fnm env)" && fnm use 24`); if npm acts up, `export npm_config_userconfig=$(mktemp)`.
- Planned commands: `npm run dev|build|test|e2e`, `wrangler dev --test-scheduled`, `wrangler deploy`.
- GitHub token only as a Worker secret. Real data only; fixtures in tests only. Free tiers only.

## Current state
Planning done. Folder has `CLAUDE.md`, `docs/`, `public/_headers` and `.github/workflows/ci.yml` copied as-is from `_house` (to be adapted in M0). No app code, no npm install. Stack: Cloudflare Worker + Static Assets + D1, Vite + TS. Next: M0.

## Known gaps / ideas
1. CSP and CI need Worker adaptation (M0).
2. House kit (tokens.css, fonts, credits card) not copied yet (M0).
3. Portfolio may need `@astrojs/rss` (M4, change goes in the portfolio repo).
Report outcomes tersely.
