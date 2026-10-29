// Server limits and windows.
// Every slot: list pass (<= MAX_LIST_PAGES GraphQL calls) + detail pass (<= DETAIL_CALLS). Budget proven in tests/unit/budget.test.ts.
export const LIST_PAGE = 100; // GraphQL page size of the light list
export const MAX_LIST_PAGES = 5; // 500 repos (public + private); beyond that the list is flagged truncated in /api/health
export const DETAIL_BATCH = 20; // repos per nodes(ids:) call
export const DETAIL_CALLS = 2; // detail calls per slot (40 repos / 15 min)
export const DETAIL_MIN_GAP_S = 86400; // a repo that already has detail data is re-read at most once a day, and only after it changed
export const PROBES_PER_SLOT = 4; // live-site probes per non-hourly slot
export const PROBE_RETRY_S = 7 * 86400; // a repo whose every candidate failed is re-probed after a week
export const SHOTS_PER_SLOT = 2; // screenshots per non-hourly slot (one browser session)
export const SHOT_DAILY_MS = 6 * 60_000; // 60% of the free 10 browser-minutes a day
export const SHOT_MIN_GAP_S = 86400; // re-shoot only after a push, and at most once a day
export const SHOT_MAX_BYTES = 1_500_000; // D1 row limit is 2 MB
export const SHOT_MIN_BYTES = 8 * 1024; // smaller = near-blank (e.g. WebGL the headless browser could not render): keep the old image
export const MAX_SITES = 30; // uptime / PSI targets per slot
export const MAX_STATUS_ORIGINS = 8; // statuspage fetches per hourly slot
export const CODEFREQ_MAX = 45; // repos per daily LOC slot (1 list call + 45 stats calls)
export const LOC_RETRY_MAX = 4; // code_frequency fetches (incl. the private list call) per hourly/15-min retry; leaves >= 3 spare per slot
export const LOC_RETRY_GAP_S = 600; // min seconds between two attempts at the same repo
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
