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

Outbound calls (Worker only, never the browser): `api.github.com` (GraphQL sync, `stats/code_frequency`), `raw.githubusercontent.com` (cover and README images), `www.googleapis.com` (PageSpeed Insights, weekly Lighthouse scores), each monitored site and status page (uptime), candidate live URLs (one GET each, see *Live site discovery*), Browser Run (screenshots of live sites), and the optional blog RSS feed.

## Freshness and alerts
Cron every 15 min. Every slot (except the dedicated 00:30 LOC and Monday 01:00 PSI slots) runs a **list pass**: every repo you own, 100 per GraphQL call, up to 5 calls (500 repos), light fields only (name, visibility, archived, push/update times, Website field, description, topics, release, licence, CI state, languages, commit count). Only rows whose fields changed are written (a SHA-256 per row in `projects.light_fp`), so a new, renamed, archived or deleted repo shows up within one slot (15 min). Archived public repos stay listed with stage `archived`; the topic `devpulse-ignore` hides a repo. If the list ever passes 500 repos it is flagged in `/api/health` (`listTruncated`) and nothing is deleted that slot. A list that returns 0 repos, or fewer than half of the stored count, is refused (logged as a failed job, nothing deleted). A repo renamed on GitHub is matched by its permanent id: every table is re-keyed in one batch, the old name is kept in `repo_alias`, and `/badge`, `/card`, `/p`, `/img`, `/shot` 301 to the canonical name (lookups are case-insensitive). History of repos that really left is deleted by the daily prune after 7 days. Uptime runs after the GitHub step in the same slot, so it never records under an old name. The redirects are `no-store` so case variants cannot grow the edge cache.

The **detail pass** (same slot, at most 2 GraphQL calls of 20 repos) reads `README.md`, `.devpulse.json`, `package.json`, `wrangler.jsonc|json|toml`, `manifest.json` and the last 10 commits of public repos. Rule: a repo is read immediately when new, and after that **at most once a day and only after it changed** (pushed or updated on GitHub since the last read). Unchanged repos keep their README/showcase data untouched. Status fields from the list pass (stage, CI, release, archived, renames, deletes) still update every slot.
With more than 30 sites, uptime rotates (each site every ⌈n/30⌉ slots) and PageSpeed rotates by week; the stale rule scales with the rotation.

Lines of code: the 00:30 UTC job asks GitHub for `stats/code_frequency` (45 repos a day: never-counted and pushed-since-last-count first, then the longest-unchecked); GitHub computes that lazily and answers 202 on the first request. Every :15/:30/:45 slot then retries up to 4 repos that still have no data (never-tried first, each at most once per 10 minutes, tracked in `meta`), and the private aggregate once all public repos are done (only when there are at most 3 private repos; it is stored only when every private repo answered). Those retries stay within the 50-subrequest slot cap (tests/unit/budget.test.ts).
Each job writes a heartbeat to `jobs` (an error code `auth|rate|http|parse|budget|unknown`, never a message). `/api/health` (never cached) returns job ages, a `stale` flag and `tokenDaysLeft`; `/api/stats` carries the same as `health`. One email is sent when GitHub sync has failed for over 3 h, uptime checks are older than 45 min, or the token has 14 days left (deduped by `jobs.alerted_at`), and one when it clears. Bodies contain only a time or a count, never repo names.

## Public routes
`/api/{projects,status,stats,languages,heatmap,commits,posts,health}`, `/badge/:name.svg`, `/card/:name.svg` (495x120 project card), `/grid.svg` (every public, non-archived repo with its stage: a self-updating image for a profile README), `/feed.xml` (Atom: commits, releases, posts), and the sheet-sync view `/sync.md`, `/sync.json`, `/sync.csv`, `/sync/snippets.md` (below). All GET, edge-cached 300s (keyed on path only; `/api/stats` 60s because it carries `health`), unknown names return a grey "unknown" SVG with status 404.

Project pages: `/p/:name` serves the app shell with per-project title, description, canonical, Open Graph and Twitter tags (values from D1, HTML-escaped; unknown names get the shell with status 404, `no-store`). `/img/:name` serves a project's declared cover image, else the first image in its README; `/img/:name/:i` (0-5) serves README showcase image i; `/shot/:name.jpg` serves the live-site screenshot (see *Snapshots*).

## Layout and keyboard
Header: verdict pill (click "N need attention" to filter the ledger to Failing), updated-ago, command palette and theme buttons; a slim banner appears when data is stale or the GitHub token is near expiry (`/api/health`). Then a bento strip (Pulse, Featured, Contributions, Totals, Languages), the **project ledger** (search, status chips, language filter, sortable columns; a Sort select replaces the headers on phones; the Activity and Uptime columns hide while nobody has data), a sticky detail pane on desktop or a full `/p/<name>` page on phones, then Activity, Uptime, Latest posts and the credits card. Dark by default, light via the toggle. Print gives a light status report (no controls, banner, pane or credits art).

**Modes.** A header toggle switches between **Developer** (the health dashboard above, default) and **Showcase** (`?mode=showcase`, remembered per browser): a gallery of every public project, and on `/p/<name>` a full showcase generated only from the repo itself: what it does (tagline, description, README summary), the live snapshot, README highlights and screenshots, the language breakdown, topics and license, the README's getting-started steps and commands, numbers (commits, approximate lines changed, stars, dates, release) and recent commits. Sections without real data are left out; nothing is invented.
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

Hub fields (same file, all optional): `"site": "https://..."` (live URL override, https, no credentials), `"sheetId": "ML-09"` (`^[A-Z0-9]{2,5}-\d{2,3}$`, the row id in the project sheet; otherwise the sheet matches on repo name), `"kind": "extension"` (browser extension; a root `manifest.json` with `manifest_version` or the topic `chrome-extension`/`browser-extension`/`firefox-addon` also counts).
README showcase: from the README (32 KB read, public repos only) DevPulse keeps the first prose paragraphs (<= 600 chars), up to 8 bullets from a Features/Highlights/What it does/Why section (else the first bullet list), up to 8 steps and the first code block (6 lines) from a Getting started/Quick start/Usage/Install/How it works section, and up to 6 repo-relative non-badge images. Real text only: absent sections stay empty.

## Live site discovery
`projects.url` (uptime, Lighthouse, screenshots) comes from, first match wins: (1) the GitHub **Website** field (https, not a github.com page; trusted as is), (2) `.devpulse.json` `site`, (3) `package.json` `homepage`, (4) the repo's wrangler config (custom-domain route, else `<name>.pages.dev` for Pages, else `<name>.<WORKERS_SUBDOMAIN>.workers.dev` for a Worker), (5) the first README link to `*.pages.dev`, `*.workers.dev` or `<owner>.github.io/<repo>`, (6) `https://<owner>.github.io/<repo>/`. Every candidate must be a public DNS name (no IP literals, `localhost` or internal suffixes like `.local`/`.internal`). Candidates 2-6 must answer one GET (2xx/3xx, no redirect follow) before they are used; one candidate is tried per repo per :15/:30/:45 slot (4 probes a slot), falling through the list. When every candidate fails the repo has no live URL (`url: -` in `/sync.md`) and the list is retried after 7 days. `urlSource` in `/api/projects` says which rule matched.

## Stages
Derived per repo (first match wins): `archived` · `live-down` (has a site whose last check failed, or an open incident) · `live-up` · `live-pending` (site found, not checked yet) · `released-extension` (browser extension with a GitHub release) · `active` (pushed in the last 30 days) · `quiet` (no push for 30+ days).
`stale` is true, with reasons in `staleWhy`, when the list pass is older than 45 min (`list`), the site's last check is older than 45 min × the uptime rotation factor (`uptime`), or a detected change was not read within its daily detail slot + 2 h (`detail`). `checkedAt` (last list pass), `detailAt`, `uptimeAt` and `shotAt` are in `/api/projects`.
Audit gaps per public repo: `readme` (README missing or under 200 chars of prose), `screenshot` (no non-badge image in the README), `about` (no description), `website` (no usable Website field), `topics` (no topics).

## Snapshots
Cloudflare Browser Run (binding `BROWSER`, free plan 10 browser-minutes a day): each :15/:30/:45 slot opens one session and shoots up to 2 live sites (1280x800, JPEG q75), capped at 6 browser-minutes a day (`meta` `shot_ms:<day>`). Rule: a site is shot when it was **never shot**, or when it was **pushed after its last shot and that shot is at least 24 h old**; an unchanged site keeps its shot forever. A failed or near-blank capture (< 8 KB, e.g. WebGL the headless browser could not draw) keeps the previous image and is retried after 24 h. Images live in D1 (`shots`, <= 1.5 MB each; R2 would need a payment method). `/shot/:name.jpg` serves it (`public, max-age=21600`, ETag, cross-origin so GitHub READMEs can embed it); without a shot it 302s to `/img/:name` (the committed cover or README screenshot), else a `no-store` 404. Public repos only.

## Sheet sync
**URL for the project sheet: https://devpulse.vwesley.workers.dev/sync.md** (also `/sync.json`, `/sync.csv`, `/sync/snippets.md`).

`/sync.md` is a plain-text table meant for a reader that can only fetch a page: a `generated:` line, counts, then one line per public repo `sheetId | repo | url | stage | lastPush | ci | uptime30d | release | created | checked | stale | gaps` (`-` = empty; dates `YYYY-MM-DD`, `checked` in UTC to the minute) and a short stage key. `/sync.json` and `/sync.csv` carry the same rows (JSON adds the card/shot/page URLs, the README snippet and audit; CSV ends each row with `generatedAt`). `/sync/snippets.md` lists a ready-to-paste README block per repo (status card, snapshot, live link, DevPulse link between `<!-- devpulse:start -->` / `<!-- devpulse:end -->`). Edge-cached 5 min; private repos never appear.

## Rate limiting and headers
Cloudflare Workers Rate Limiting binding `RL` (`wrangler.jsonc`): 60 requests / 10 s per client IP (per location) across `/api/*`, `/badge/*`, `/card/*`, `/p/*`, `/sync*`, `/grid.svg`, `/feed.xml` (`/img/*` and `/shot/*` are exempt: name-validated, 2 MB cap, cached 24h at the edge and in the browser, so a page of covers cannot trip it); over the limit returns 429 `no-store` with `Retry-After`. Without the binding (tests, local dev) there is no limit. Every Worker response carries HSTS, `Referrer-Policy: no-referrer`, `nosniff` and `frame-ancestors 'none'`; JSON without a TTL is `no-store`. The page CSP (`public/_headers`) is strict: no inline script/style, no third-party hosts, and `require-trusted-types-for 'script'; trusted-types devpulse`. The only Trusted Types sink the app hits is `navigator.serviceWorker.register`, fed by one `devpulse` policy that mints just `/sw.js` (`src/web/main.ts`); there is no `innerHTML` anywhere, and `tests/e2e/csp.spec.ts` fails on any violation. Deploys are local (`wrangler deploy`); CI only tests.

## Data
Stored in Cloudflare D1: project metadata, languages, uptime checks, Lighthouse scores (the UI shows only the latest week; rows older than 90 days are pruned daily), daily contribution counts and recent public commits. Lines of code are an estimate (additions + deletions summed from GitHub's weekly stats).
Privacy: private repos contribute combined numbers only. `/api/stats` rounds totals (commits to 10, lines to 1000) and sets `approx: true` when private data is included; `/api/languages` returns the combined list only. Uptime is summarised by the 15-minute cron (`uptime_summary`, `daily_uptime`, `incidents`) so requests never scan raw checks.

## Notice
Provided as is, without warranty. Licensed under MIT (see `LICENSE`).
