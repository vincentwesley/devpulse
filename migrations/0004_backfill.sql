-- Backfill the rollup tables from raw `checks` (0003 only created them). Idempotent: safe to re-run.
INSERT OR REPLACE INTO daily_uptime (project, date, up, total)
  SELECT project, date(ts, 'unixepoch'), SUM(ok), COUNT(*) FROM checks GROUP BY project, date(ts, 'unixepoch');

INSERT INTO uptime_summary (project, up, uptime30d, latency_json, updated_at)
  SELECT c.project,
    (SELECT ok FROM checks l WHERE l.project = c.project ORDER BY ts DESC LIMIT 1),
    (SELECT ROUND(100.0 * SUM(d.up) / SUM(d.total), 1) FROM daily_uptime d WHERE d.project = c.project AND d.date >= date('now', '-30 days')),
    COALESCE((SELECT json_group_array(ms ORDER BY ts) FROM (SELECT ms, ts FROM checks m WHERE m.project = c.project AND m.ms IS NOT NULL ORDER BY ts DESC LIMIT 48)), '[]'),
    MAX(c.ts)
  FROM checks c WHERE true GROUP BY c.project
  ON CONFLICT(project) DO UPDATE SET up = excluded.up, uptime30d = excluded.uptime30d, latency_json = excluded.latency_json, updated_at = excluded.updated_at
    WHERE excluded.updated_at >= uptime_summary.updated_at;

-- One incident per run of consecutive failed checks, skipped when an existing incident already covers its start.
INSERT INTO incidents (project, start_ts, end_ts, status)
  SELECT project, ts, (SELECT MIN(n.ts) FROM checks n WHERE n.project = s.project AND n.ts > s.ts AND n.ok = 1), status
  FROM (SELECT project, ts, ok, status, LAG(ok) OVER (PARTITION BY project ORDER BY ts) AS prev FROM checks) s
  WHERE ok = 0 AND (prev IS NULL OR prev = 1)
    AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.project = s.project AND i.start_ts <= s.ts AND COALESCE(i.end_ts, 9e18) >= s.ts);
