# DevPulse

Public, read-only dashboard for the health of vincentwesley's deployed projects: commits and heatmap, CI, uptime, languages, lines-of-code estimate, weekly Lighthouse scores and latest blog posts. Runs on Cloudflare Workers + D1. Live data only: projects are discovered from GitHub and nothing is mocked outside tests.

## Run
```
npm ci
npm run db:migrate:local
cp .dev.vars.example .dev.vars   # fill in values
npm run dev                       # frontend; use `npx wrangler dev` for the Worker
npm run typecheck && npm test && npm run build
```

## Deploy
**Migrate remote BEFORE deploy**: `npm run db:migrate:remote`, then `npx wrangler deploy`. New code reads columns/tables that only exist after the migration (e.g. 0005 showcase columns); deploying first breaks `/api/projects`.

## Secrets and network calls
Worker secrets (never committed; see `.dev.vars.example`):
- `GITHUB_TOKEN`: fine-grained token, **All repositories** (needed for private aggregates), read-only: Metadata, Contents, Commit statuses, Actions (Contents feeds `.devpulse.json`/README, Commit statuses feeds `ci_state`; there is no "Checks" permission). The site shows a banner when the token is within 14 days of expiry (read from the `GitHub-Authentication-Token-Expiration` response header). Public repos are listed by name; with access to private repos they contribute **aggregates only** (language bytes, commit and line counts), never a name, URL or message.
- `PSI_KEY` (optional): Google API key for PageSpeed Insights.
- `ALERT_TO` (optional): the address that receives alert emails; it must be a verified destination in Cloudflare Email Routing. Var `ALERT_FROM` (`wrangler.jsonc`, `alerts@vwesley.dev`) must be on that Email Routing domain. The `send_email` binding `ALERT` has no destination in the config, so no address is committed. Setup: Cloudflare dashboard > Email > Email Routing for the domain > enable, add your address as a destination and verify it, then `npx wrangler secret put ALERT_TO`. Missing binding or secret = alerts silently off.

Outbound calls (Worker only, never the browser): `api.github.com` (GraphQL sync, `stats/code_frequency`), `www.googleapis.com` (PageSpeed Insights, weekly Lighthouse scores), each monitored site and status page (uptime), and the optional blog RSS feed.

## Freshness and alerts
Cron every 15 min. Each non-hourly slot runs one small GraphQL change check (id, names, pushedAt, updatedAt, visibility, archived, CI state; stored as a SHA-256 in `meta`) and does a full sync only when it changed; the hourly slot always syncs. A sync that returns 0 repos, or fewer than half of the stored count, is refused (logged as a failed job, nothing deleted). A repo renamed on GitHub is matched by its permanent id: every table is re-keyed in one batch, the old name is kept in `repo_alias`, and `/badge`, `/card`, `/p`, `/img` 301 to the canonical name (lookups are case-insensitive). History of repos that really left is deleted by the daily prune after 7 days. Uptime runs after the GitHub step in the same slot, so it never records under an old name. The redirects are `no-store` so case variants cannot grow the edge cache.

Lines of code: the 00:30 UTC job asks GitHub for `stats/code_frequency`; GitHub computes that lazily and answers 202 on the first request. Every hourly and 15-minute slot then retries up to 4 repos that still have no data (never-tried first, each at most once per 10 minutes, tracked in `meta`), and the private aggregate once all public repos are done (only when there are at most 3 private repos; it is stored only when every private repo answered). Those retries stay within the 50-subrequest slot cap (tests/unit/budget.test.ts).
Each job writes a heartbeat to `jobs` (an error code `auth|rate|http|parse|budget|unknown`, never a message). `/api/health` (never cached) returns job ages, a `stale` flag and `tokenDaysLeft`; `/api/stats` carries the same as `health`. One email is sent when GitHub sync has failed for over 3 h, uptime checks are older than 45 min, or the token has 14 days left (deduped by `jobs.alerted_at`), and one when it clears. Bodies contain only a time or a count, never repo names.

## Public routes
`/api/{projects,status,stats,languages,heatmap,commits,posts,health}`, `/badge/:name.svg`, `/card/:name.svg` (495x120 project card), `/feed.xml` (Atom: commits, releases, posts). All GET, edge-cached 300s (keyed on path only; `/api/stats` 60s because it carries `health`), unknown names return a grey "unknown" SVG with status 404.

Project pages: `/p/:name` serves the app shell with per-project title, description, canonical, Open Graph and Twitter tags (values from D1, HTML-escaped; unknown names get the shell with status 404, `no-store`). `/img/:name` serves a project's declared cover image (see below).

## Layout and keyboard
Header: verdict pill (click "N need attention" to filter the ledger to Failing), updated-ago, command palette and theme buttons; a slim banner appears when data is stale or the GitHub token is near expiry (`/api/health`). Then a bento strip (Pulse, Featured, Contributions, Totals, Languages), the **project ledger** (search, status chips, language filter, sortable columns; a Sort select replaces the headers on phones; the Activity and Uptime columns hide while nobody has data), a sticky detail pane on desktop or a full `/p/<name>` page on phones, then Activity, Uptime, Latest posts and the credits card. Dark by default, light via the toggle. Print gives a light status report (no controls, banner, pane or credits art).
Keyboard: `/` or Ctrl/Cmd+K command palette (projects, sections, theme, *Copy feed URL*, *Copy status summary*), `?` shortcut help, `j`/`k` move through the ledger, `f` focuses its search, Enter opens, Esc closes. Tap targets are at least 44px on phones.
Alert emails: see *Secrets* above (`ALERT_TO` + Email Routing); `/api/health` shows the job ages behind them.

## Project showcase (`.devpulse.json`)
A public repo can add an optional `showcase` block next to `deps` in its root `.devpulse.json` (8 KB max). Invalid fields are dropped silently; nothing is coerced.
```json
{
  "deps": ["https://www.githubstatus.com"],
  "showcase": {
    "featured": true,
    "tagline": "One line, 140 characters max.",
    "image": "docs/cover.png",
    "links": [{ "label": "Live demo", "url": "https://example.com" }]
  }
}
```
- `tagline`: string, 1-140 chars. `featured`: boolean. `links`: up to 5 of `{label (<=30 chars), url (https, no credentials)}`.
- `image`: repo-relative path, `^[A-Za-z0-9._/-]{1,200}\.(png|jpe?g|webp|gif)$`, no `..`, no leading `/`. SVG is never served.
- `/img/:name` fetches `raw.githubusercontent.com/<GITHUB_OWNER>/<repo>/HEAD/<image>` (owner and repo from the sync, never from the request), no redirects, 10 s timeout, image/png|jpeg|webp|gif only, 2 MB cap, served same-origin with `nosniff`, edge-cached 24 h. Any failure is a `no-store` 404.
- Privacy: the sync also reads `README.md` and stores a plain-text excerpt (<=1200 chars: first paragraphs and up to 6 bullets; badges, images, HTML and code stripped) for **public repos only**. Private repos' README, showcase and images are never stored or served.

## Rate limiting and headers
Cloudflare Workers Rate Limiting binding `RL` (`wrangler.jsonc`): 60 requests / 10 s per client IP (per location) across `/api/*`, `/badge/*`, `/card/*`, `/p/*`, `/feed.xml` (`/img/*` is exempt: name-validated, 2 MB cap, cached 24h at the edge and in the browser, so a page of covers cannot trip it); over the limit returns 429 `no-store` with `Retry-After`. Without the binding (tests, local dev) there is no limit. Every Worker response carries HSTS, `Referrer-Policy: no-referrer`, `nosniff` and `frame-ancestors 'none'`; JSON without a TTL is `no-store`. The page CSP (`public/_headers`) is strict: no inline script/style, no third-party hosts, and `require-trusted-types-for 'script'; trusted-types devpulse`. The only Trusted Types sink the app hits is `navigator.serviceWorker.register`, fed by one `devpulse` policy that mints just `/sw.js` (`src/web/main.ts`); there is no `innerHTML` anywhere, and `tests/e2e/csp.spec.ts` fails on any violation. Deploys are local (`wrangler deploy`); CI only tests.

## Data
Stored in Cloudflare D1: project metadata, languages, uptime checks, Lighthouse scores (the UI shows only the latest week; rows older than 90 days are pruned daily), daily contribution counts and recent public commits. Lines of code are an estimate (additions + deletions summed from GitHub's weekly stats).
Privacy: private repos contribute combined numbers only. `/api/stats` rounds totals (commits to 10, lines to 1000) and sets `approx: true` when private data is included; `/api/languages` returns the combined list only. Uptime is summarised by the 15-minute cron (`uptime_summary`, `daily_uptime`, `incidents`) so requests never scan raw checks.

## Notice
Provided as is, without warranty. Licensed under MIT (see `LICENSE`).
