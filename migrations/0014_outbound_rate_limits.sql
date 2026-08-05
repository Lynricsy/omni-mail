CREATE TABLE IF NOT EXISTS outbound_rate_limits (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  minute_started_at INTEGER NOT NULL,
  minute_count INTEGER NOT NULL,
  day_started_at INTEGER NOT NULL,
  day_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

ALTER TABLE users ADD COLUMN outbound_minute_limit INTEGER CHECK (
  outbound_minute_limit IS NULL OR outbound_minute_limit BETWEEN 1 AND 100
);

ALTER TABLE users ADD COLUMN outbound_day_limit INTEGER CHECK (
  outbound_day_limit IS NULL OR outbound_day_limit BETWEEN 1 AND 10000
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('outbound_rate_limit_enabled', '1'),
  ('outbound_rate_limit_minute', '10'),
  ('outbound_rate_limit_day', '200');
