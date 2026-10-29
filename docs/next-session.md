> Update at the end of any session that changed state. Keep it lean.

Continue work on **DevPulse**, the public project hub at https://devpulse.vwesley.workers.dev (workers.dev subdomain renamed vincentwesleybiz → vwesley on 2026-10-24; Atom entry ids keep the `tag:devpulse.vincentwesleybiz.workers.dev` prefix on purpose). Repo is PUBLIC. Only do what the owner asks.

## State (2026-10-29)
- **Round 5 is pushed but NOT DEPLOYED.** Live is still round 4 (version f34716a3; rollbacks cbeac656, 29f505ca). The cloud session had no Cloudflare credentials, so deploy is an owner step (below).
- Round 5 adds:
  - list pass every 15 min and detail pass at most once a day, only on change;
  - live-URL discovery, stages and freshness, audit gaps;
  - `/sync.md|json|csv`, `/sync/snippets.md`;
  - Browser Run snapshots `/shot/:name.jpg` (stored in D1);
  - `/img/:name/:i`, `/grid.svg`;
  - Developer/Showcase modes.
- Migration **0008** (additive). README documents every rule.
- Verified locally:
  - typecheck clean;
  - 195 unit tests and 147 e2e (+4 skipped) green, axe 0 in both modes, both themes, 390 and 1280;
  - build ok, initial JS 33 KB gz;
  - `wrangler deploy --dry-run` ok (175 KiB gz, BROWSER binding resolves);
  - migrations 0001-0008 apply cleanly on local D1.
- Expected after deploy (audit run on real public data 2026-10-29):
  - black-hole (package.json), koi-pond (README link) and devpulse (wrangler) get live URLs automatically.
  - No live URL: DueReminder, access-ease, tldr-panel, glass-compiler, llm-microscope, earth-through-time.
  - Proposed fixes are in `docs/repo-cleanup.md` (not applied; owner approves).
- Accounts: all repos, Autopilot included, are under `vincentwesley`. `Pincenw` (owner's email) has one 2023 repo and is not included; including it would need a second token plus an `EXTRA_OWNERS` var.
- access-ease CI is FAILURE (hands-off).

## Deploy order (needs Cloudflare credentials)
1. `npx wrangler d1 export DB --remote --output backup-2026-10-29.sql`
2. `npm run db:migrate:remote` (0008 BEFORE deploying: new code reads the new columns and the `shots` table).
3. `npx wrangler deploy`
4. Smoke test:
   - `/api/health` ok, with `listAt` within 15 min;
   - `/sync.md` lists 11 repos, all stages set, no private names;
   - after 1-2 quarter slots, black-hole, koi-pond and devpulse have URLs, and a `/shot/` image appears for a live site.
5. `ratelimits` `namespace_id` "1001" must stay unused by other Workers on the account.

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
1. Deploy credentials, or run the deploy order above locally.
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
