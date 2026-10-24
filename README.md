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
Run `npx wrangler d1 migrations apply DB --remote` **before** `npx wrangler deploy`.

## Secrets and network calls
Worker secrets (never committed; see `.dev.vars.example`):
- `GITHUB_TOKEN`: fine-grained token, **All repositories** (needed for private aggregates), read-only: Metadata, Contents, Commit statuses, Checks (the last two feed `ci_state`). Public repos are listed by name; with access to private repos they contribute **aggregates only** (language bytes, commit and line counts), never a name, URL or message.
- `PSI_KEY` (optional): Google API key for PageSpeed Insights.

Outbound calls (Worker only, never the browser): `api.github.com` (GraphQL sync, `stats/code_frequency`), `www.googleapis.com` (PageSpeed Insights, weekly Lighthouse scores), each monitored site and status page (uptime), and the optional blog RSS feed.

## Public routes
`/api/{projects,status,stats,languages,heatmap,commits,posts,health}`, `/badge/:name.svg`, `/card/:name.svg` (495x120 project card), `/feed.xml` (Atom: commits, releases, posts). All GET, edge-cached 300s (keyed on path only), unknown names return a grey "unknown" SVG with status 404.

Project pages: `/p/:name` serves the app shell with per-project title, description, canonical, Open Graph and Twitter tags (values from D1, HTML-escaped; unknown names get the shell with status 404, `no-store`). `/img/:name` serves a project's declared cover image (see below).

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
Cloudflare Workers Rate Limiting binding `RL` (`wrangler.jsonc`): 60 requests / 10 s per client IP (per location) across `/api/*`, `/badge/*`, `/card/*`, `/img/*`, `/p/*`, `/feed.xml`; over the limit returns 429 `no-store` with `Retry-After`. Without the binding (tests, local dev) there is no limit. Every Worker response carries HSTS, `Referrer-Policy: no-referrer`, `nosniff` and `frame-ancestors 'none'`; JSON without a TTL is `no-store`. Deploys are local (`wrangler deploy`); CI only tests.

## Data
Stored in Cloudflare D1: project metadata, languages, uptime checks, Lighthouse scores, daily contribution counts and recent public commits. Lines of code are an estimate (additions + deletions summed from GitHub's weekly stats).
Privacy: private repos contribute combined numbers only. `/api/stats` rounds totals (commits to 10, lines to 1000) and sets `approx: true` when private data is included; `/api/languages` returns the combined list only. Uptime is summarised by the 15-minute cron (`uptime_summary`, `daily_uptime`, `incidents`) so requests never scan raw checks.

## Notice
Provided as is, without warranty. Licensed under MIT (see `LICENSE`).
