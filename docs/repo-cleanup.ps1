# One-off GitHub clean-up for vincentwesley's public repos (About description, Website, topics).
# Generated 2026-11-19 from each repo's own README and the live-site probes in docs/repo-cleanup.md.
# Safe to re-run: it only fills fields that are EMPTY right now and only ADDS topics. It never changes code, READMEs,
# visibility, or an existing description/website, and never removes a topic.
# Run from the devpulse folder:  .\docs\repo-cleanup.ps1          (preview first: .\docs\repo-cleanup.ps1 -DryRun)
param([switch]$DryRun)
$ErrorActionPreference = 'Continue'

gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'GitHub CLI is not logged in. Run: gh auth login   then run this script again.' -ForegroundColor Yellow; exit 1 }

$owner = 'vincentwesley'
$repos = @(
  @{ name = 'DueReminder'; description = 'A responsive PWA for managing reminders with two-way Google Calendar sync, recurrence, natural-language quick-add, and offline support.'; homepage = ''; topics = @('pwa', 'reminders', 'google-calendar', 'offline-first', 'natural-language', 'typescript') }
  @{ name = 'MetaLensVGC'; description = ''; homepage = ''; topics = @('pokemon', 'vgc', 'metagame', 'analytics', 'dashboard', 'cloudflare-pages') }
  @{ name = 'access-ease'; description = ''; homepage = ''; topics = @('chrome-extension', 'accessibility', 'a11y', 'dyslexia', 'readability', 'side-panel') }
  @{ name = 'black-hole'; description = 'A real-time black hole you can fly around in a browser tab: every pixel traces light through the curved spacetime of a Schwarzschild black hole.'; homepage = 'https://vincentwesley.github.io/black-hole/'; topics = @('black-hole', 'general-relativity', 'raytracing', 'webgl2', 'glsl', 'physics-simulation') }
  @{ name = 'clearslip'; description = ''; homepage = ''; topics = @('chrome-extension', 'ad-blocker', 'tracker-blocker', 'privacy', 'manifest-v3', 'easylist') }
  @{ name = 'devpulse'; description = 'Public hub for my projects: a showcase of what each one does, plus a developer view of uptime, CI and activity. Cloudflare Workers + D1.'; homepage = 'https://devpulse.vwesley.workers.dev'; topics = @('cloudflare-workers', 'cloudflare-d1', 'dashboard', 'portfolio', 'uptime-monitor', 'typescript') }
  @{ name = 'earth-through-time'; description = 'A 3D globe that rewinds the continents 750 million years, driven by a real plate-tectonic reconstruction.'; homepage = ''; topics = @('plate-tectonics', 'paleogeography', 'globe', 'threejs', 'pygplates', 'data-visualization') }
  @{ name = 'glass-compiler'; description = 'A compiler you can see through: write a few lines in Pane and watch every stage, from tokens and syntax tree to bytecode and a stepping virtual machine.'; homepage = 'https://vincentwesley.github.io/glass-compiler/'; topics = @('compiler', 'education', 'bytecode', 'virtual-machine', 'visualization', 'typescript') }
  @{ name = 'koi-pond'; description = ''; homepage = 'https://vincentwesley.github.io/koi-pond/'; topics = @('webgl2', 'generative-art', 'water-simulation', 'interactive', 'koi') }
  @{ name = 'llm-microscope'; description = 'Look inside GPT-2 small running in your browser: next-word guesses, all 144 attention heads, the logit lens, and switching heads off to see what changes.'; homepage = ''; topics = @('interpretability', 'gpt-2', 'transformers', 'attention', 'logit-lens', 'machine-learning') }
  @{ name = 'pagehold'; description = ''; homepage = 'https://pagehold.vwesley.workers.dev'; topics = @('pdf', 'pdf-tools', 'privacy', 'cloudflare-workers') }
  @{ name = 'sdf-forge'; description = 'Build 3D shapes in your browser by connecting nodes, then export them for 3D printing (STL, 3MF), games (GLB) or as shader code.'; homepage = 'https://vincentwesley.github.io/sdf-forge/'; topics = @('sdf', 'signed-distance-field', 'node-editor', '3d-printing', 'shader', 'procedural-modeling') }
  @{ name = 'sg-time-machine'; description = ''; homepage = 'https://vincentwesley.github.io/sg-time-machine/'; topics = @('singapore', 'open-data', 'data-archive', 'github-actions', 'maps', 'time-series') }
  @{ name = 'squeeze'; description = 'DEFLATE, zlib, gzip and PNG written from scratch in TypeScript: a library, a command-line tool and a web page that shows compression happening on your own text and images.'; homepage = ''; topics = @('deflate', 'compression', 'gzip', 'zlib', 'png', 'typescript') }
)

$done = 0; $skipped = 0; $failed = 0
foreach ($r in $repos) {
  $full = "$owner/$($r.name)"
  $json = gh repo view $full --json description,homepageUrl,repositoryTopics
  if ($LASTEXITCODE -ne 0 -or -not $json) { Write-Host "$($r.name): could not read the repo, skipped" -ForegroundColor Red; $failed++; continue }
  $cur = $json | ConvertFrom-Json
  $have = @($cur.repositoryTopics | ForEach-Object { $_.name })
  $editArgs = @()
  $changes = @()
  if ($r.description -and -not $cur.description) { $editArgs += @('--description', $r.description); $changes += 'description' }
  if ($r.homepage -and -not $cur.homepageUrl) { $editArgs += @('--homepage', $r.homepage); $changes += 'website' }
  $add = @($r.topics | Where-Object { $have -notcontains $_ })
  if ($add.Count) { $editArgs += @('--add-topic', ($add -join ',')); $changes += "topics +$($add.Count)" }
  if (-not $editArgs.Count) { Write-Host "$($r.name): nothing to change"; $skipped++; continue }
  if ($DryRun) { Write-Host "$($r.name): would set $($changes -join ', ')" -ForegroundColor Cyan; $done++; continue }
  gh repo edit $full @editArgs
  if ($LASTEXITCODE -eq 0) { Write-Host "$($r.name): set $($changes -join ', ')" -ForegroundColor Green; $done++ }
  else { Write-Host "$($r.name): gh repo edit failed" -ForegroundColor Red; $failed++ }
}
$verb = if ($DryRun) { 'would change' } else { 'changed' }
Write-Host ""
Write-Host "Done: $done $verb, $skipped already fine, $failed failed."
