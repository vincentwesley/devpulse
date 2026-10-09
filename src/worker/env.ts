export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GITHUB_TOKEN: string;
  INGEST_TOKEN: string;
  GITHUB_OWNER: string;
  PORTFOLIO_RSS_URL?: string;
}
