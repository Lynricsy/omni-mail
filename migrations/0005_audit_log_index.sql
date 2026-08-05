CREATE INDEX IF NOT EXISTS idx_audit_cursor
  ON audit_logs(created_at DESC, id DESC);
