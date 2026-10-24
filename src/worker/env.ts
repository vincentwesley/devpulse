export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  RL?: RateLimit; // Workers Rate Limiting binding; absent in tests / local dev => no limit
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  PORTFOLIO_RSS_URL?: string;
  PSI_KEY?: string;
}
