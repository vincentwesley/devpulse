-- Additive only. List/detail split (round 5): light hash, detail stamp, live-site discovery, audit, sheet id, snapshots.
ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN homepage TEXT; -- raw GitHub Website field (audit); `url` is the verified live site
ALTER TABLE projects ADD COLUMN updated_at_gh TEXT; -- GitHub updatedAt (metadata edits re-trigger the detail pass)
ALTER TABLE projects ADD COLUMN light_fp TEXT; -- hash of the list-pass fields; unchanged repos are never rewritten
ALTER TABLE projects ADD COLUMN detail_at TEXT; -- ISO time of the last detail pass (README, .devpulse.json, configs, commits)
ALTER TABLE projects ADD COLUMN url_source TEXT; -- website|devpulse|package|wrangler|readme|pages
ALTER TABLE projects ADD COLUMN site_cands TEXT; -- JSON [{src,url}] discovered by the detail pass, probed in order
ALTER TABLE projects ADD COLUMN probe_url TEXT;
ALTER TABLE projects ADD COLUMN probe_ok INTEGER;
ALTER TABLE projects ADD COLUMN probe_at INTEGER;
ALTER TABLE projects ADD COLUMN loc_at TEXT;
ALTER TABLE projects ADD COLUMN readme_image TEXT; -- first relative README image (fallback cover)
ALTER TABLE projects ADD COLUMN audit TEXT; -- JSON gap codes found by the detail pass (readme, screenshot)
ALTER TABLE projects ADD COLUMN sheet_id TEXT;
ALTER TABLE projects ADD COLUMN kind TEXT; -- 'extension' or NULL
ALTER TABLE projects ADD COLUMN showcase_json TEXT; -- {summary, highlights, runThrough, images} parsed from the README (real text only)
-- Public sites only (rows follow `projects`). bytes NULL = last attempt failed / blank, tried_at throttles retries.
CREATE TABLE shots (repo TEXT PRIMARY KEY, name TEXT NOT NULL, bytes BLOB, type TEXT, taken_at INTEGER, tried_at INTEGER NOT NULL, src TEXT, ms INTEGER);
