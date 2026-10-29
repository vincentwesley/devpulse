export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  RL?: RateLimit; // Workers Rate Limiting binding; absent in tests / local dev => no limit
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  WORKERS_SUBDOMAIN?: string; // var: the account workers.dev subdomain, for wrangler-declared Workers
  BROWSER?: Fetcher; // Browser Run binding (screenshots); absent in tests / local dev => no shots
  PORTFOLIO_RSS_URL?: string;
  PSI_KEY?: string;
  ALERT?: SendEmail; // send_email binding (no destination in wrangler.jsonc); absent => alerts are a no-op
  ALERT_FROM?: string; // var, an address on the Email Routing domain
  ALERT_TO?: string; // secret, a verified Email Routing destination
}
