-- Additive only: nothing dropped (the old `ci` table stays so a rollback still works).
ALTER TABLE projects ADD COLUMN description TEXT;
ALTER TABLE projects ADD COLUMN language TEXT;
ALTER TABLE projects ADD COLUMN stars INTEGER;
ALTER TABLE projects ADD COLUMN forks INTEGER;
ALTER TABLE projects ADD COLUMN created_at TEXT;
ALTER TABLE projects ADD COLUMN pushed_at TEXT;
ALTER TABLE projects ADD COLUMN release_tag TEXT;
ALTER TABLE projects ADD COLUMN release_at TEXT;
ALTER TABLE projects ADD COLUMN license TEXT;
ALTER TABLE projects ADD COLUMN commit_count INTEGER;
ALTER TABLE projects ADD COLUMN loc INTEGER;
ALTER TABLE projects ADD COLUMN ci_state TEXT;
CREATE TABLE languages (repo TEXT NOT NULL, lang TEXT NOT NULL, bytes INTEGER NOT NULL, color TEXT, PRIMARY KEY (repo, lang));
CREATE TABLE code_freq (repo TEXT NOT NULL, week INTEGER NOT NULL, "add" INTEGER NOT NULL, "del" INTEGER NOT NULL, PRIMARY KEY (repo, week));
-- Private repos: aggregates only. No repo name, URL or message column exists here by design.
CREATE TABLE totals_private (lang TEXT PRIMARY KEY, bytes INTEGER NOT NULL, color TEXT);
CREATE TABLE private_agg (id INTEGER PRIMARY KEY CHECK (id = 1), repos INTEGER NOT NULL DEFAULT 0, commit_count INTEGER NOT NULL DEFAULT 0, loc INTEGER NOT NULL DEFAULT 0);
