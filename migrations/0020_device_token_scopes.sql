ALTER TABLE device_sessions
  ADD COLUMN scopes TEXT NOT NULL DEFAULT '*';
