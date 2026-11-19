# One-off repo clean-up

Refreshed 2026-11-19 for all 18 public repos, using the same audit and live-site discovery code DevPulse runs (`src/worker/lib/audit.ts`, `src/worker/lib/site.ts`); every live URL below answered a GET today. DevPulse never edits other repos, and this session's GitHub access can't change repo settings, so the changes are packed into one script you run: **`docs/repo-cleanup.ps1`**. It only fills fields that are empty today and only adds topics (never removes or overwrites anything, never touches code or READMEs). Preview with `-DryRun`.

Gap codes:
- `readme`: no README with a real explanation (at least 200 characters of prose).
- `screenshot`: no non-badge image in the README.
- `about`: no About description.
- `website`: no Website field.
- `topics`: no topics.

## Live URLs (DevPulse finds these on its own after deploy)

| Repo | Live URL | Found via |
|---|---|---|
| MetaLensVGC | https://metalensvgc.pages.dev | Website field |
| safe-regex | https://vincentwesley.github.io/safe-regex/ | Website field |
| synthwave-drive | https://vincentwesley.github.io/synthwave-drive/ | Website field |
| black-hole | https://vincentwesley.github.io/black-hole/ | package.json `homepage` |
| sdf-forge | https://vincentwesley.github.io/sdf-forge/ | package.json `homepage` |
| devpulse | https://devpulse.vwesley.workers.dev | wrangler config |
| pagehold | https://pagehold.vwesley.workers.dev | wrangler config |
| glass-compiler | https://vincentwesley.github.io/glass-compiler/ | README link |
| koi-pond | https://vincentwesley.github.io/koi-pond/ | README link |
| sg-time-machine | https://vincentwesley.github.io/sg-time-machine/ | README link |

The script also writes the discovered URL into the Website field of black-hole, sdf-forge, devpulse, pagehold, glass-compiler, koi-pond and sg-time-machine.

**No live URL found (8):** DueReminder, access-ease, clearslip, tldr-panel, earth-through-time, little-sql, llm-microscope, squeeze. access-ease, clearslip and tldr-panel are Chrome extensions: once they're in the Chrome Web Store, put the store link in their Website field. DueReminder's wrangler config points at `due-reminder.vwesley.workers.dev`, which doesn't answer, so it isn't deployed there. earth-through-time's Website field links to its own GitHub page (DevPulse ignores github.com links); the script leaves it alone because it isn't empty.

## Gaps per repo (before the script)

| Repo | Gaps | Script fixes |
|---|---|---|
| squeeze | readme, screenshot, about, website, topics | about, topics |
| DueReminder | screenshot, about, website, topics | about, topics |
| devpulse | screenshot, about, website, topics | about, website, topics |
| little-sql | screenshot, about, website, topics | nothing: its README has no project explanation yet |
| pagehold | readme, screenshot, website, topics | website, topics |
| black-hole | about, website, topics | all three |
| earth-through-time | about, website, topics | about, topics |
| glass-compiler | about, website, topics | all three |
| llm-microscope | about, website, topics | about, topics |
| sdf-forge | about, website, topics | all three |
| clearslip | screenshot, website, topics | topics |
| koi-pond | screenshot, website, topics | website, topics |
| sg-time-machine | screenshot, website, topics | website, topics |
| MetaLensVGC | screenshot, topics | topics |
| access-ease | website, topics | topics |
| tldr-panel | website | nothing (needs the store link) |
| safe-regex | none | |
| synthwave-drive | none | |

Descriptions are taken from each README's own first paragraph; topics name what the README says the project uses. Adding `chrome-extension` to access-ease and clearslip also files them under *Extensions* on the Project Hub.

`screenshot` gaps close by pasting the DevPulse snippet below (its live snapshot counts as the README picture once the site is deployed); `readme` gaps (squeeze, pagehold, little-sql) need README text only you can write.

## README snippet (paste near the top of each README)

Every repo's ready-made block is at https://devpulse.vwesley.workers.dev/sync/snippets.md and on its `/p/<name>` page (Copy button). The pattern, for black-hole:

```md
<!-- devpulse:start -->
[![black-hole status on DevPulse](https://devpulse.vwesley.workers.dev/card/black-hole.svg)](https://devpulse.vwesley.workers.dev/p/black-hole)

[![Current screenshot of black-hole](https://devpulse.vwesley.workers.dev/shot/black-hole.jpg)](https://vincentwesley.github.io/black-hole/)

[Live site](https://vincentwesley.github.io/black-hole/) · [Health on DevPulse](https://devpulse.vwesley.workers.dev/dev/p/black-hole)
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

Software engineer: modern web platforms, data architecture and applied AI. Everything I ship, with live status, lives on **[DevPulse](https://devpulse.vwesley.workers.dev/)**.

[![All my projects, live status](https://devpulse.vwesley.workers.dev/grid.svg)](https://devpulse.vwesley.workers.dev/)

#### Featured
[![black-hole](https://devpulse.vwesley.workers.dev/card/black-hole.svg)](https://devpulse.vwesley.workers.dev/p/black-hole)
[![llm-microscope](https://devpulse.vwesley.workers.dev/card/llm-microscope.svg)](https://devpulse.vwesley.workers.dev/p/llm-microscope)
[![MetaLensVGC](https://devpulse.vwesley.workers.dev/card/MetaLensVGC.svg)](https://devpulse.vwesley.workers.dev/p/MetaLensVGC)
[![tldr-panel](https://devpulse.vwesley.workers.dev/card/tldr-panel.svg)](https://devpulse.vwesley.workers.dev/p/tldr-panel)
```

`/grid.svg` lists every public repo with its stage, so new repos show up on your profile without editing the README.
