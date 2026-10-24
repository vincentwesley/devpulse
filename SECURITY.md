# Security policy

## Reporting a vulnerability
Please report security issues privately through GitHub: **Security tab, "Report a vulnerability"** on this repository.
Do not open a public issue for a vulnerability. You can expect an acknowledgement within a few days.

## Scope and safety notes
- This project is provided "as is", without warranty (see `LICENSE`).
- It contains no install-time scripts (`preinstall`/`postinstall`/`prepare`) and does not run code on your machine when you clone it.
- Secrets are never committed. Configuration is read from environment variables; see `.dev.vars.example` where present.
- Only the latest version on the default branch is supported.
- Public read-only API: per-IP rate limiting (Workers Rate Limiting binding), GET only, no query-string-driven D1 reads (edge cache keyed on path), strict response headers (HSTS, `Referrer-Policy: no-referrer`, `nosniff`, `frame-ancestors 'none'`, COOP on pages).
- Private repositories are reduced to rounded aggregates; no names, URLs or messages are stored for them.
- Outbound fetches (feeds, status pages) are size-capped by streamed byte count; feed parsing is linear-time and capped at 50 items.
- Deploys run locally; CI holds no Cloudflare credentials.
