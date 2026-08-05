CREATE TABLE IF NOT EXISTS device_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  access_expires_at INTEGER NOT NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  refresh_expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_user
  ON device_sessions(user_id, revoked_at, last_used_at DESC);
