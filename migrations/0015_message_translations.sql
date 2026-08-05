CREATE TABLE IF NOT EXISTS message_translations (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  target_language TEXT NOT NULL,
  source_language TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (message_id, target_language)
);

CREATE TABLE IF NOT EXISTS translation_rate_limits (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
