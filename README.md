# DevPulse

Public, read-only dashboard for the health of vincentwesley's deployed projects: commits and heatmap, CI, uptime, weekly Lighthouse scores and latest blog posts. Runs on Cloudflare Workers + D1. Live data only: projects are discovered from GitHub and nothing is mocked outside tests.

## Run
```
npm ci
npm run db:migrate:local
cp .dev.vars.example .dev.vars   # fill in values
npm run dev                       # frontend; use `npx wrangler dev` for the Worker
npm run typecheck && npm test && npm run build
```

## Secrets
Worker secrets (never committed): `GITHUB_TOKEN` (read-only GitHub token) and `INGEST_TOKEN` (authorises the Lighthouse ingest endpoint). See `.dev.vars.example`.

## Notice
Provided as is, without warranty. Licensed under MIT (see `LICENSE`).
