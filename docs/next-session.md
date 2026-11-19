> Update at the end of any session that changed state. Keep it lean.

Continue work on **DevPulse**, the public project hub at https://devpulse.vwesley.workers.dev (workers.dev subdomain renamed vincentwesleybiz → vwesley on 2026-10-24; Atom entry ids keep the `tag:devpulse.vincentwesleybiz.workers.dev` prefix on purpose). Repo is PUBLIC. Only do what the owner asks.

## State (2026-11-19)
- **Rounds 5 and 6 are pushed on `claude/relaxed-goodall-cepw4q` but NOT DEPLOYED.** Live is still round 4 (version f34716a3; rollbacks cbeac656, 29f505ca); master's Vin's Atelier logo/kit commits are merged into this branch and also not deployed yet. Deploy is an owner step (below).
- Round 6: two pages. **Project Hub** at `/` (portfolio-style gallery, `/p/<name>` story pages from README content; no CI/uptime/stars/commits/LOC/%, only release version and "updated N ago") and **Developer** at `/dev/` (the dashboard, `/dev/p/<name>`). Header switch on both; old dashboard links on `/` are sent to `/dev/` by `public/hub-redirect.js`. `/api/health` jobs now carry `code` (fixed error enum).
- Round 5: list pass every 15 min + detail pass once a day on change, live-URL discovery, stages/freshness, audit gaps, `/sync.md|json|csv`, `/sync/snippets.md`, Browser Run snapshots `/shot/:name.jpg` (D1), `/img/:name/:i`, `/grid.svg`. Migration **0008** (additive).
- Live 2026-11-19: 18 public + 22 private repos; the github job showed `ok:false` (round-4 code has no error code in health). After deploy, read `/api/health` `jobs.github.code`.
- Expected after deploy: black-hole (package.json), koi-pond (README link), devpulse (wrangler) get live URLs automatically; repos created since 2026-10-29 are audited live (see `/sync.md`). Clean-up proposals: `docs/repo-cleanup.md` (not applied).
- Accounts: all repos are under `vincentwesley`; `Pincenw` is not included (would need a second token + `EXTRA_OWNERS`). access-ease CI FAILURE (hands-off).

## Deploy order (owner's PC, PowerShell, from this branch)
1. `cd` to the repo, `fnm use 24`, `git status` clean, `git fetch origin claude/relaxed-goodall-cepw4q`, `git checkout claude/relaxed-goodall-cepw4q`, `git pull`.
2. `npm ci`, `npm run build`, `npx wrangler whoami` (login if needed).
3. Backup: `npx wrangler d1 export devpulse --remote --output "$HOME\devpulse-backups\devpulse-<date>.sql"`.
4. `npm run db:migrate:remote` (0008 BEFORE deploying), then `npx wrangler deploy`.
5. Smoke: `/` = Project Hub, `/dev/` = dashboard, `/?sort=name` lands on `/dev/?sort=name`, `/sync.md` 200 with no private names, `/api/health` has `listAt` and `jobs.*.code`; after 1-2 quarter slots URLs are discovered and a `/shot/` image appears.
6. `ratelimits` `namespace_id` "1001" must stay unused by other Workers. Rollback: `npx wrangler rollback f34716a3` (0008 is additive).

## How to work here
- Orchestrator rule: dispatch builders, don't write code inline. House rules are in `../CLAUDE.md`.
- Local machine: Node 24 via fnm in PowerShell. The cloud container has Node 22, which works.
- e2e in the cloud container: `PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e` (the pinned Playwright expects a different browser build).
- GitHub token only as a Worker secret. Real data only; fixtures in tests only. Free tiers only. No Actions minutes: verify locally, deploy with wrangler, **migrate remote before deploy**.

## Budget (tests/unit/budget.test.ts, 500 public + 40 private repos, 60 sites, a full week)
Worst case per slot, as fetches / D1 queries (free cap 50 each):

| Slot | Fetches / D1 | What runs |
|---|---|---|
| hourly | 47 / 24 | list ≤5 pages + detail ≤2 + heatmap + uptime ≤30 + posts + statuspages ≤8; no probes, shots or LOC retry |
| :15/:30/:45 | 47 / 20 | list + detail + uptime + LOC retry 4 + probes 4 + 1 Browser Run session |
| 00:30 LOC | 46 / 4 | |
| Mon 01:00 PSI | 30 / 3 | |

- Uptime and PSI rotate when there are more than 30 sites.
- The list covers 500 repos (`listTruncated` appears in `/api/health` beyond that).
- How a Browser Run session counts against subrequests isn't documented; it's assumed to be 1, and there are 3 spare.

## Needs the owner
1. Run the deploy order above.
2. Browser Run needs no new secret (Workers binding). Check the dashboard shows usage after deploy.
3. Optional:
   - `.devpulse.json` `sheetId`/`site`/`kind` per repo;
   - the `gh` clean-up commands and README snippets in `docs/repo-cleanup.md`;
   - make `vincentwesley/vincentwesley` public and paste the profile README (uses `/grid.svg`).
4. Optional, carried over: `ALERT_TO` + Email Routing, `PSI_KEY`, `PORTFOLIO_RSS_URL`. Regenerate the GitHub token before expiry (banner at 14 days).
5. Proposal, not built: an Access-protected private status Worker (Cloudflare Access self-hosted app on a vwesley.dev subdomain, a separate Worker reading private status live, storing nothing).

## Known gaps / ideas
1. Edge cache lag: a new shot can take up to 6 h to replace an old one at the edge (1 h if there was none).
2. Showcase text is only as good as each README; repos without Features/Getting started sections show fewer sections.
3. The `meta` `fp` row from the old change check is unused (harmless).

Report outcomes tersely.

## Log
- 2026-11-16: Vin's Atelier draggable logo + sign-off + Logo radios in the credits section; pre-paint is external public/logo-init.js so the inline theme script hash is unchanged.
- 2026-11-17 hygiene sweep: qa-output/ gitignored.
- 2026-11-17: logo spec waits for the --logo-x transition before measuring (15s polls).
- 2026-11-18: kit sync (tokens.css, credits.css re-copied per UPGRADING.md); soft fills (heatmap, uptime/lang bars) moved to --border-soft in project CSS; tokens-app.css still overrides --s1..6 (px) and --font-mono.
