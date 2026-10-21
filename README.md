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

## Secrets and network calls
Worker secrets (never committed; see `.dev.vars.example`):
- `GITHUB_TOKEN`: read-only GitHub token (Metadata + Contents). Public repos are listed by name; with access to private repos they contribute **aggregates only** (language bytes, commit and line counts), never a name, URL or message.
- `PSI_KEY` (optional): Google API key for PageSpeed Insights.

Outbound calls (Worker only, never the browser): `api.github.com` (GraphQL sync, `stats/code_frequency`), `www.googleapis.com` (PageSpeed Insights, weekly Lighthouse scores), each monitored site and status page (uptime), and the optional blog RSS feed.

## Data
Stored in Cloudflare D1: project metadata, languages, uptime checks, Lighthouse scores, daily contribution counts and recent public commits. Lines of code are an estimate (additions + deletions summed from GitHub's weekly stats).
## Notice
Provided as is, without warranty. Licensed under MIT (see `LICENSE`).
