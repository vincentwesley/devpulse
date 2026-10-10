# DevPulse (TOOL-01) plan

A personal dashboard showing the health of all of vincentwesley's deployed projects (MetaLens, DueReminder and the rest) in one place: commits and heatmap, CI, uptime, weekly Lighthouse scores, dependency API status, and latest blog posts. Public and read-only. Projects are discovered automatically from GitHub; uptime is checked every 15 minutes.

## Why Cloudflare over Vercel
Vercel Hobby cron runs at most once a day and the plan is non-commercial only, and it would need a third-party database. Cloudflare's free tier has cron triggers, D1 and static assets, and every existing project already deploys there.

## Architecture
- **One Worker, `devpulse`, using Workers Static Assets.** It serves the Vite + TS frontend, `/api/*` (JSON GET routes plus one POST ingest route) and a `scheduled()` handler. No separate Pages project.
- **Storage: D1** (free: 5 GB, 100k writes a day). Tables: `projects`, `checks` (time, project, ok, ms), `lighthouse` (week, project, 4 scores), `ci` (latest run per repo), `commits_daily`, `api_status`, `posts`. A daily job deletes `checks` older than 90 days. No KV; API responses are cached with `Cache-Control` / Cache API.
- **One cron, `*/15 * * * *`.**
  - Every run: fetch each project URL with HEAD/GET to record status and latency, and poll each dependency's Statuspage `/api/v2/status.json`.
  - When the minute is 0 (hourly): GitHub sync, which auto-discovers every public, non-fork, non-archived repo without the topic `devpulse-ignore` (newest 10 by push), then pulls their latest Actions runs and recent commits. Also fetch the portfolio RSS feed.
  - Daily: fetch the contribution calendar through GitHub GraphQL (needed for the heatmap; REST doesn't provide it) and prune old `checks`.
- **Dependencies per project:** an optional `.devpulse.json` in each repo, e.g. `{ "deps": ["https://www.githubstatus.com"] }`. Without it, the project has no dependency panel.
- **Lighthouse:** a weekly GitHub Actions workflow in the devpulse repo. It reads `/api/projects`, runs `lighthouse` (mobile, 3 runs, median) and POSTs the scores to `/api/ingest/lighthouse` with a bearer `INGEST_TOKEN`. A Worker can't run Chrome, and Browser Rendering's free quota is tight, so Actions it is.
- **Secrets:** `GITHUB_TOKEN` is a fine-grained, public-repo, read-only token kept as a Worker secret. `INGEST_TOKEN` is both a Worker secret and an Actions secret. The browser never sees a token. Strict CSP comes from `_house/_headers`, set through the Worker's assets headers.
- **Frontend:** Vite + TS, D3 only for the heatmap and the uptime/Lighthouse sparklines. Plain DOM, no framework. House style, dark by default, credits card at the bottom.
- **Real data only:** fixtures exist only in tests. An empty state reads "no data yet" and is never filled with placeholder data.

## Scaffold notes
- M0 done (code scaffold): `public/_headers` (strict CSP, `connect-src 'self'`, immutable `/assets/*`), CI with a deploy job, house kit in `src/web/house/` (tokens.css, fonts, credits card), Worker stubs in `src/worker/`, D1 migration `migrations/0001_init.sql`.
- Not done in M0 (needs owner): `wrangler d1 create devpulse` and paste the id into `wrangler.jsonc`, Cloudflare repo secrets, first deploy to workers.dev.

## MVP scope
A grid of project cards (up/down, 30-day uptime %, latency sparkline, CI badge, latest Lighthouse scores, dependency status), a commit heatmap with recent commits, the 5 latest portfolio posts, and the credits card.
Not in the MVP: alerts and notifications, private repos, auth, history beyond 90 days, multiple users.

## Milestones
- **M0** Scaffold the Worker, static assets and D1 migration; copy house kit; deploy a "hello" build to workers.dev; set up CI (`_house/ci.yml` plus `wrangler deploy` on main).
- **M1** GitHub sync: topic discovery, CI, commits, heatmap (GraphQL).
- **M2** Uptime cron and dependency status, cards with sparklines.
- **M3** Lighthouse weekly workflow and ingest route.
- **M4** RSS posts. Add `@astrojs/rss` to the portfolio if it's missing (that change goes in the portfolio repo).
- **M5** Polish: a11y with axe, screenshots at 375px and desktop in dark and light, reduced motion, `security-review`, go live.

## Owner prerequisites
Create the fine-grained GitHub token. Set a repo "Website" (https) to enable uptime for it; `devpulse-ignore` topic hides a repo. Confirm the portfolio RSS URL. Have a Cloudflare account logged in through wrangler.

## Verification (later milestones)
Vitest for the parsers and sync logic using recorded fixtures. Playwright and axe on the built site with D1 seeded only in the test environment. Run `wrangler dev --test-scheduled` and hit `/__scheduled` to check the cron. After deploying, check the real dashboard shows live data for MetaLens and DueReminder.
