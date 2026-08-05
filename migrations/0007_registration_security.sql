CREATE TABLE IF NOT EXISTS registration_attempts (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_registration_attempts_window
  ON registration_attempts(window_started_at);
