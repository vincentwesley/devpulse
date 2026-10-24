> Update at the end of any session that changed state. Keep it lean.

Continue work on **DevPulse**, the public project hub. Deployed 2026-10-24 (version 60b97099; earlier rollback targets 96c1755f, 0d408649). Repo is PUBLIC and pushed. Migrations 0001-0005 applied remotely. Live smoke 2026-10-24: Lighthouse mobile perf 98, a11y/BP/SEO 100, CLS 0.045, axe clean, 390px page ~6.9k px. Only do what the owner asks.

## Before anything
1. Work in the repo root. Read `docs/PLAN.md`.
2. Repo is already public (owner OK 2026-10-24). Never change visibility again without an OK; one push per milestone only.

## PENDING VERIFICATION (resume here)
Owner added the new fine-grained `GITHUB_TOKEN` secret on 2026-10-24 ~20:30 SGT (permissions: Metadata, Contents, Commit statuses, Actions; "Checks" doesn't exist for PATs). The next hourly sync (21:00 SGT = 13:00 UTC) is the first to use it; a manual sync can't be forced (local `wrangler dev` doesn't receive deployed secrets). After it, check `GET /api/stats?x=<random>` and `/api/projects?x=<random>`:
- `syncedAt` moved past 13:00Z; `approx: true`; `totals.repos` > 9 (private repos counted); languages include private-only languages.
- every public project has non-null `ciState`. If null, the token lacks a permission the GraphQL `statusCheckRollup` needs (try Actions read / Commit statuses); report which.
- no private repo name anywhere: compare `gh repo list vincentwesley --visibility private --json name` against /api/projects, /api/stats, /api/languages, /api/commits, /feed.xml, /card/*, /badge/*, /p/*.
- LOC/`loc` fills after the 00:30 UTC job; posts section stays hidden until `PORTFOLIO_RSS_URL` is set.
Then: owner may still delete `INGEST_TOKEN` (`npx wrangler secret delete INGEST_TOKEN`, plus any Actions secret); optional showcase blocks in repos' `.devpulse.json` (owner commits them; other repos are hands-off for us).

## How to work here
- Orchestrator rule: dispatch builders, don't write code inline. House rules in `../CLAUDE.md`.
- Node 24. The Bash tool breaks on `cd` (fnm); use PowerShell with `fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression; fnm use 24`.
- Commands: see CLAUDE.md. Headless e2e only; no visible browser.
- GitHub token only as a Worker secret. Real data only; fixtures in tests only. Free tiers only. No Actions minutes: verify locally, deploy with `npx wrangler deploy` (**migrate remote BEFORE deploy**: `npm run db:migrate:remote`).

## Current state
Worker: GraphQL sync (`github.ts`, up to 50 repos), cron (`cron.ts`: uptime 15 min; hourly sync + RSS + statuspages; 00:00 prune; 00:30 LOC `loc.ts`; Mon 01:00 PageSpeed `psi.ts`). Routes: projects/github/posts/stats, `/api/status` (90d strips + incidents), `/feed.xml` (Atom), `/badge/:name.svg`, `/card/:name.svg` (unknown names are `no-store`). Per-IP rate limit via binding `RL` (60 req/10s). Migrations 0001-0005 (0003 = rollup tables, 0004 = backfill from `checks`, idempotent, 0005 = showcase columns); all applied remotely. Frontend: hero counters, languages bar, hub cards with sort/filter + detail dialog, status section, activity feed, heatmap, command palette, service worker (`src/web/sw.js`, network-first API + offline banner), motion. 127 unit + e2e green (local, headless).
Showcase: `/p/<name>` (project page, per-project OG tags injected by `routes/page.ts`, trailing `/` tolerated, HEAD ok), `/img/<name>` (cover proxy from the repo, <=2 MB, never svg; exempt from the rate limit; `/api/projects` emits `cover` as `/img/<name>?v=<hash of cover_path+pushed_at>` to bust browser/SW caches, edge cache keys on pathname). Fields come from `.devpulse.json` (`tagline`, `featured`, `image`, `links`; parser `parseShowcase` in `lib/github-parse.ts`) plus a README excerpt (control/bidi chars stripped).
Live check 2026-10-21: projects, stats, languages, badges return real data. LOC is 0 until the first 00:30 UTC run; posts empty (no RSS URL).

## Deploy order
1. **Migrate remote BEFORE deploying**: `npm run db:migrate:remote` (new code reads `uptime_summary`/`daily_uptime`/`incidents` and the 0005 showcase columns).
2. `ratelimits` `namespace_id` "1001" in `wrangler.jsonc` must be unused on the Cloudflare account; change it if another Worker owns it.
3. `npx wrangler deploy`. Rollback: previous version id above.

## Needs the owner (do last)
1. DONE 2026-10-24: new `GITHUB_TOKEN` (see PENDING VERIFICATION).
2. GitHub profile: enable "Include private contributions" for the heatmap (confirm with owner).
3. `npx wrangler secret delete INGEST_TOKEN`; remove the Actions secret (confirm with owner).
4. Optional: `PSI_KEY` secret, `PORTFOLIO_RSS_URL`, repo "Website" fields for uptime, `.devpulse.json` showcase/deps.

## Known gaps / ideas
1. Repos beyond 50 are dropped; LOC covers 45 repos/day with rotation.
2. Deps status empty until a repo has `.devpulse.json`.
3. The unused `ci` table can be dropped in a later migration.
4. No screenshots taken for the new UI (needs owner OK for visual checks).

Report outcomes tersely.

