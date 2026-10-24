-- Additive only. Summary/rollup tables are written by the 15-min uptime run so reads never scan `checks`.
CREATE INDEX checks_ts ON checks (ts);
CREATE INDEX projects_name ON projects (name);
CREATE TABLE uptime_summary (project TEXT PRIMARY KEY, up INTEGER NOT NULL, uptime30d REAL, latency_json TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL);
CREATE TABLE daily_uptime (project TEXT NOT NULL, date TEXT NOT NULL, up INTEGER NOT NULL, total INTEGER NOT NULL, PRIMARY KEY (project, date));
CREATE TABLE incidents (id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT NOT NULL, start_ts INTEGER NOT NULL, end_ts INTEGER, status INTEGER);
CREATE INDEX incidents_open ON incidents (end_ts, project);
