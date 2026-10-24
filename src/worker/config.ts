// Server limits and windows.
export const MAX_REPOS = 50; // public repos kept per sync; subrequest budget is proven in tests/unit/budget.test.ts
export const REPO_PAGE = 50; // GraphQL page size
export const MAX_REPO_PAGES = 3; // so a sync is <= 3 GraphQL calls
export const MAX_SITES = 30; // uptime / PSI targets per slot
export const MAX_STATUS_ORIGINS = 8; // statuspage fetches per hourly slot
export const CODEFREQ_MAX = 45; // repos per daily LOC slot (1 list call + 45 stats calls)
export const CODEFREQ_WEEKS = 26;
export const PSI_TIMEOUT_MS = 60_000;
export const COMMITS_KEPT = 50;
export const COMMITS_PER_REPO = 5; // newest per repo returned (and protected from the global prune)
export const COMMITS_RETURNED = 60; // total cap for /api/commits
export const LATENCY_POINTS = 48;
export const UPTIME_DAYS = 30;
export const RETENTION_DAYS = 90;
export const POSTS = 5;
export const HEATMAP_DAYS = 365;
