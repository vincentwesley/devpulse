> Update at the end of any session that changed state. Keep it lean.

Continue work on **DevPulse**, the public project hub, now at https://devpulse.vwesley.workers.dev (owner renamed the account workers.dev subdomain from vincentwesleybiz to vwesley on 2026-10-24; the old host is gone; the vin-context MCP connector or other Workers may still point at the old host; Atom entry ids intentionally keep the `tag:devpulse.vincentwesleybiz.workers.dev` prefix). Round 3 (Ledger + bento redesign, freshness backend) and round 4 (perf, tap targets, Trusted Types, LOC retry, print styles, cleanup) are DEPLOYED, current version f34716a3 (rollbacks: cbeac656, 29f505ca). Repo is PUBLIC. Migrations 0001-0007 applied remotely (0007 dropped the unused `ci` table). Live smoke 2026-10-26: axe 0 violations (both themes, 390 + 1280), no overflow/console/CSP errors, 429 limiter, offline, deep links, palette all pass; Lighthouse mobile perf 98 / a11y 100 / BP 100 / SEO 100, CLS 0, LCP 2.3 s; initial JS 31 KB gz (lazy palette/detail/motion chunks). 162 unit + 114 e2e green. CSP: `style-src 'self'` (no unsafe-inline), inline theme script allowed by a build-time sha256 in `script-src`, Trusted Types enforced (one `devpulse` policy for `/sw.js`). Only do what the owner asks.

## Before anything
1. Work in the repo root. Read `docs/PLAN.md`.
2. Repo is already public (owner OK 2026-10-24). Never change visibility again without an OK; one push per milestone only.

## State after the token (2026-10-24, verified)
New fine-grained `GITHUB_TOKEN` (read-only: Metadata, Contents, Commit statuses, Actions; there is no "Checks" permission) works: 21:00 SGT sync gave 29 repos, `approx: true`, `ciState` populated for repos with Actions runs, no private repo names in any output (scanned api/projects, stats, languages, commits, heatmap, status, posts, feed, cards, badges). `INGEST_TOKEN` deleted and "include private contributions" enabled by the owner (heatmap picks it up at the 00:00 UTC refresh).
Still to confirm next session: `loc`/`codeFreq` are still null on 2026-10-26 even though the 00:30 UTC job ran OK (GitHub `/stats/code_frequency` returns 202 on first request). A retry (`retryLoc` in `loc.ts`, up to 4 repos per slot, once per 10 min) was deployed 2026-10-26; check `/api/projects` loc fields after a few slots. If still null, debug the live GitHub response (status codes) before adding more code. Heatmap should include private contributions after 00:00 UTC. access-ease CI shows FAILURE (other repos are hands-off unless the owner asks). Posts stay hidden until `PORTFOLIO_RSS_URL` is set. Optional showcase blocks go in repos' `.devpulse.json` (owner commits them).

## How to work here
- Orchestrator rule: dispatch builders, don't write code inline. House rules in `../CLAUDE.md`.
- Node 24. The Bash tool breaks on `cd` (fnm); use PowerShell with `fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression; fnm use 24`.
- Commands: see CLAUDE.md. Headless e2e only; no visible browser.
- GitHub token only as a Worker secret. Real data only; fixtures in tests only. Free tiers only. No Actions minutes: verify locally, deploy with `npx wrangler deploy` (**migrate remote BEFORE deploy**: `npm run db:migrate:remote`).

## Current state
Worker: GraphQL sync (`github.ts`, up to 50 repos), cron (`cron.ts`: uptime 15 min; hourly sync + RSS + statuspages; 00:00 prune; 00:30 LOC `loc.ts`; Mon 01:00 PageSpeed `psi.ts`). Routes: projects/github/posts/stats, `/api/status` (90d strips + incidents), `/feed.xml` (Atom), `/badge/:name.svg`, `/card/:name.svg` (unknown names are `no-store`). Per-IP rate limit via binding `RL` (60 req/10s). Migrations 0001-0005 (0003 = rollup tables, 0004 = backfill from `checks`, idempotent, 0005 = showcase columns); all applied remotely. Frontend: hero counters, languages bar, hub cards with sort/filter + detail dialog, status section, activity feed, heatmap, command palette, service worker (`src/web/sw.js`, network-first API + offline banner), motion. (older description; the round-3 layout replaced the cards/tab strip with a ledger table + bento tiles, see index.html and src/web/ledger.css, bento.css, feed.css, shell.css).
Showcase: `/p/<name>` (project page, per-project OG tags injected by `routes/page.ts`, trailing `/` tolerated, HEAD ok), `/img/<name>` (cover proxy from the repo, <=2 MB, never svg; exempt from the rate limit; `/api/projects` emits `cover` as `/img/<name>?v=<hash of cover_path+pushed_at>` to bust browser/SW caches, edge cache keys on pathname). Fields come from `.devpulse.json` (`tagline`, `featured`, `image`, `links`; parser `parseShowcase` in `lib/github-parse.ts`) plus a README excerpt (control/bidi chars stripped).
Live check 2026-10-21: projects, stats, languages, badges return real data. LOC is 0 until the first 00:30 UTC run; posts empty (no RSS URL).

Freshness (round 3, migration 0006, deployed): 15-min GraphQL change check with fingerprint in `meta`, hourly safety-net sync, wipe guard, rename re-key by `repo_id` + `repo_alias` with 301s, 7-day orphan grace, `jobs` heartbeats (error codes only), token expiry from `GitHub-Authentication-Token-Expiration`, `/api/health` + `stats.health`, email alerts (`alerts.ts`, binding `ALERT`). Slot budget (tests/unit/budget.test.ts): hourly <= 43 fetches, change-check slot <= 35 (30 uptime + 1 check + 3 pages + 1 heatmap), 00:30 LOC 46, Mon 01:00 PSI 30; LOC/PSI slots skip the check.

## Deploy order
1. **Migrate remote BEFORE deploying**: `npm run db:migrate:remote` (new code reads `uptime_summary`/`daily_uptime`/`incidents`, the 0005 showcase columns and the 0006 `jobs`/`meta`/`repo_alias`/`repo_id`). Back up D1 first (`wrangler d1 export`).
2. `ratelimits` `namespace_id` "1001" in `wrangler.jsonc` must be unused on the Cloudflare account; change it if another Worker owns it.
3. `npx wrangler deploy`. Rollback: previous version id above.

## Needs the owner (do last)
1. DONE 2026-10-24: new `GITHUB_TOKEN`, private contributions setting, `INGEST_TOKEN` deleted.
2. Alerts: Cloudflare dashboard > Email > Email Routing for `vwesley.dev`: enable, add your address as a destination, click the verification link. Then `npx wrangler secret put ALERT_TO` (that address). `ALERT_FROM` var is `alerts@vwesley.dev` (change in `wrangler.jsonc` if the domain differs). Without them alerts stay off.
3. Regenerate the GitHub token before it expires (banner and email appear at 14 days left).
4. Optional: `PSI_KEY` secret, `PORTFOLIO_RSS_URL`, repo "Website" fields for uptime, `.devpulse.json` showcase/deps.

## Known gaps / ideas
1. Repos beyond 50 are dropped; LOC covers 45 repos/day with rotation.
2. Deps status empty until a repo has `.devpulse.json`.
3. The unused `ci` table can be dropped in a later migration.
4. No screenshots taken for the new UI (needs owner OK for visual checks).

Report outcomes tersely.

