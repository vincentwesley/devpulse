# One-off repo clean-up (proposal, not applied)

Generated 2026-10-29 from public GitHub data, using the same audit and live-site discovery code DevPulse now runs (`src/worker/lib/audit.ts`, `src/worker/lib/site.ts`). Nothing here has been applied: DevPulse never edits other repos. Run the commands after you've reviewed them. Once DevPulse is deployed, `/sync.md` (gaps column) and the dashboard's *Repo hygiene* tile show the live state.

Gap codes:
- `readme`: no README with a real explanation (at least 200 characters of prose).
- `screenshot`: no non-badge image in the README.
- `about`: no About description.
- `website`: no Website field.
- `topics`: no topics.

## Live URLs

| Repo | Live URL | Found via |
|---|---|---|
| MetaLensVGC | https://metalensvgc.pages.dev | Website field |
| synthwave-drive | https://vincentwesley.github.io/synthwave-drive/ | Website field |
| black-hole | https://vincentwesley.github.io/black-hole/ | package.json `homepage` (probe 200) |
| koi-pond | https://vincentwesley.github.io/koi-pond/ | README link (probe 200) |
| devpulse | https://devpulse.vwesley.workers.dev | wrangler.jsonc name (probe 200) |

**No live URL found:** DueReminder, access-ease, tldr-panel, glass-compiler, llm-microscope, earth-through-time. access-ease and tldr-panel are Chrome extensions; when they're in the Chrome Web Store, set the store URL as their Website. If llm-microscope or earth-through-time are deployed somewhere (their READMEs describe browser apps), add a `"site"` to their `.devpulse.json` or set the Website field.

## Gaps per repo

| Repo | Gaps |
|---|---|
| glass-compiler | readme, screenshot, about, website, topics (the README is only a title) |
| DueReminder | screenshot, about, website, topics |
| devpulse | screenshot, about, website, topics |
| earth-through-time | about, website, topics (its Website field points at github.com, which doesn't count) |
| black-hole | about, website, topics |
| llm-microscope | about, website, topics |
| koi-pond | screenshot, website, topics |
| MetaLensVGC | screenshot, topics |
| access-ease | website, topics |
| tldr-panel | website |
| synthwave-drive | none |

## gh commands (review, then run)

Descriptions come from each README's own first paragraph. Topics come from what the README says the project uses.

```bash
gh repo edit vincentwesley/black-hole --description "Real-time Schwarzschild black hole you can fly around in the browser: every pixel ray-traced through curved spacetime (WebGL2)." --homepage "https://vincentwesley.github.io/black-hole/" --add-topic webgl2,raytracing,black-hole,general-relativity,shader,physics-simulation
```

```bash
gh repo edit vincentwesley/koi-pond --homepage "https://vincentwesley.github.io/koi-pond/" --add-topic webgl2,interactive,water-simulation,generative-art,canvas
```

```bash
gh repo edit vincentwesley/devpulse --description "Live public hub for my projects: uptime, CI, activity, snapshots and auto-generated showcases. Cloudflare Workers + D1." --homepage "https://devpulse.vwesley.workers.dev" --add-topic cloudflare-workers,cloudflare-d1,dashboard,uptime-monitor,typescript,github-api
```

```bash
gh repo edit vincentwesley/MetaLensVGC --add-topic pokemon,vgc,metagame,analytics,dashboard,cloudflare-pages
```

```bash
gh repo edit vincentwesley/llm-microscope --description "Look inside GPT-2 small running in your browser: next-word predictions, all 144 attention heads, logit lens, head ablation." --add-topic interpretability,gpt-2,transformers,attention,logit-lens,webworker
```

```bash
gh repo edit vincentwesley/earth-through-time --description "3D globe that rewinds the continents 750 million years with a real plate-tectonic reconstruction." --homepage "" --add-topic plate-tectonics,paleogeography,globe,threejs,data-visualization
```

```bash
gh repo edit vincentwesley/DueReminder --description "Reminder PWA with two-way Google Calendar sync, recurrence, natural-language quick-add and offline support." --add-topic pwa,reminders,google-calendar,offline-first,typescript
```

```bash
gh repo edit vincentwesley/access-ease --add-topic chrome-extension,accessibility,a11y,dyslexia,side-panel,manifest-v3
```

`earth-through-time --homepage ""` clears the github.com link; replace it with the real URL if the app is deployed. glass-compiler needs a README before a description is worth writing; tell me what it is and I'll draft both.

For the Website fields of the extensions (Chrome Web Store URLs, once you have them):

```bash
gh repo edit vincentwesley/tldr-panel --homepage "<chrome web store url>"
```

```bash
gh repo edit vincentwesley/access-ease --homepage "<chrome web store url>"
```

## README snippet (paste near the top of each README)

Every repo's ready-made block is at https://devpulse.vwesley.workers.dev/sync/snippets.md and on its `/p/<name>` page (Copy button). The pattern, for black-hole:

```md
<!-- devpulse:start -->
[![black-hole status on DevPulse](https://devpulse.vwesley.workers.dev/card/black-hole.svg)](https://devpulse.vwesley.workers.dev/p/black-hole)

[![Current screenshot of black-hole](https://devpulse.vwesley.workers.dev/shot/black-hole.jpg)](https://vincentwesley.github.io/black-hole/)

[Live site](https://vincentwesley.github.io/black-hole/) · [Health on DevPulse](https://devpulse.vwesley.workers.dev/p/black-hole)
<!-- devpulse:end -->
```

Use the generated version from `/sync/snippets.md` (it's exact for each repo). The card and snapshot update themselves; the snapshot falls back to the repo's committed screenshot when there is no live site. That one snippet also clears the `screenshot` gap for koi-pond, MetaLensVGC, DueReminder and devpulse.

## Optional `.devpulse.json` lines

```json
{ "sheetId": "ML-09", "site": "https://example.pages.dev", "kind": "extension" }
```

- `sheetId`: your sheet's ID, so the sheet can match rows by ID instead of repo name.
- `site`: an explicit live URL when discovery can't find it.
- `kind: "extension"`: marks an extension that has no `chrome-extension` topic.

## Profile README (github.com/vincentwesley)

The `vincentwesley/vincentwesley` repo exists but is private. GitHub only shows a profile README when that repo is public. Suggested `README.md`:

```md
### Hi, I'm Vincent 👋

Software engineer: modern web platforms, data architecture and applied AI. Everything I ship, with live status, lives on **[DevPulse](https://devpulse.vwesley.workers.dev/?mode=showcase)**.

[![All my projects, live status](https://devpulse.vwesley.workers.dev/grid.svg)](https://devpulse.vwesley.workers.dev/?mode=showcase)

#### Featured
[![black-hole](https://devpulse.vwesley.workers.dev/card/black-hole.svg)](https://devpulse.vwesley.workers.dev/p/black-hole)
[![llm-microscope](https://devpulse.vwesley.workers.dev/card/llm-microscope.svg)](https://devpulse.vwesley.workers.dev/p/llm-microscope)
[![MetaLensVGC](https://devpulse.vwesley.workers.dev/card/MetaLensVGC.svg)](https://devpulse.vwesley.workers.dev/p/MetaLensVGC)
[![tldr-panel](https://devpulse.vwesley.workers.dev/card/tldr-panel.svg)](https://devpulse.vwesley.workers.dev/p/tldr-panel)
```

`/grid.svg` lists every public repo with its stage, so new repos show up on your profile without editing the README.
