CREATE TABLE projects (repo TEXT PRIMARY KEY, name TEXT, url TEXT, topics TEXT, deps TEXT, updated_at TEXT);
CREATE TABLE checks (project TEXT NOT NULL, ts INTEGER NOT NULL, ok INTEGER NOT NULL, status INTEGER, ms INTEGER);
CREATE INDEX checks_project_ts ON checks (project, ts);
CREATE TABLE lighthouse (project TEXT NOT NULL, week TEXT NOT NULL, performance INTEGER, accessibility INTEGER, best_practices INTEGER, seo INTEGER, PRIMARY KEY (project, week));
CREATE TABLE ci (repo TEXT PRIMARY KEY, status TEXT, conclusion TEXT, url TEXT, updated_at TEXT);
CREATE TABLE commits_daily (date TEXT PRIMARY KEY, count INTEGER NOT NULL);
CREATE TABLE commits_recent (repo TEXT NOT NULL, sha TEXT PRIMARY KEY, message TEXT, author TEXT, ts TEXT, url TEXT);
CREATE TABLE api_status (url TEXT PRIMARY KEY, name TEXT, indicator TEXT, description TEXT, ts INTEGER);
CREATE TABLE posts (url TEXT PRIMARY KEY, title TEXT, published TEXT, ts INTEGER);
