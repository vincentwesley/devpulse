export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  PORTFOLIO_RSS_URL?: string;
  PSI_KEY?: string;
}
