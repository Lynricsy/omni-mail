ALTER TABLE users
  ADD COLUMN storage_quota_bytes INTEGER NOT NULL DEFAULT 1073741824;
ALTER TABLE users
  ADD COLUMN storage_used_bytes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE messages
  ADD COLUMN quota_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN trashed_at INTEGER;
ALTER TABLE messages ADD COLUMN purge_after INTEGER;

UPDATE messages
   SET quota_bytes = size
 WHERE quota_bytes = 0 AND size > 0;

UPDATE messages
   SET trashed_at = COALESCE(trashed_at, updated_at, created_at),
       purge_after = COALESCE(trashed_at, updated_at, created_at) + 2592000
 WHERE folder = 'trash' AND purge_after IS NULL;

UPDATE users
   SET storage_quota_bytes = CASE
         WHEN role IN ('super_admin', 'admin') THEN 5368709120
         WHEN role = 'temporary' THEN 268435456
         ELSE storage_quota_bytes
       END,
       storage_used_bytes = COALESCE((
         SELECT SUM(messages.size)
           FROM mailboxes
           JOIN messages ON messages.mailbox_address = mailboxes.address
          WHERE mailboxes.user_id = users.id
       ), 0);

CREATE INDEX IF NOT EXISTS idx_messages_purge
  ON messages(purge_after, id);

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual', 'enable')),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  object_key TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_backup_runs_started
  ON backup_runs(started_at DESC);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('backup_enabled', '0'),
  ('trash_retention_days', '30'),
  ('temporary_data_retention_days', '7'),
  ('audit_retention_days', '180'),
  ('failed_message_retention_days', '7'),
  ('default_user_quota_mib', '1024'),
  ('default_temporary_quota_mib', '256');
