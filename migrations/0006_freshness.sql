-- Additive only: rename tracking, cron heartbeats, change fingerprint / token expiry. The old `ci` table stays.
ALTER TABLE projects ADD COLUMN repo_id TEXT; -- GitHub's permanent node id; survives renames
CREATE INDEX projects_repo_id ON projects (repo_id);
CREATE TABLE repo_alias (old_name TEXT PRIMARY KEY COLLATE NOCASE, repo TEXT NOT NULL); -- old bare name -> current owner/name
-- Times are unix seconds. last_err_code is a fixed code (auth|rate|http|parse|budget|unknown), never a message. last_err_at = start of the current failure streak.
CREATE TABLE jobs (job TEXT PRIMARY KEY, last_ok INTEGER, last_err_code TEXT, last_err_at INTEGER, alerted_at INTEGER);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
