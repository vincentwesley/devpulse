-- Additive only: showcase fields from .devpulse.json + README excerpt (public repos only).
ALTER TABLE projects ADD COLUMN tagline TEXT;
ALTER TABLE projects ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN cover_path TEXT;
ALTER TABLE projects ADD COLUMN readme_excerpt TEXT;
ALTER TABLE projects ADD COLUMN links_json TEXT;
