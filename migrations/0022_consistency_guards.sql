CREATE TABLE IF NOT EXISTS pending_object_deletions (
  object_key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailboxes_one_primary
  ON mailboxes(user_id)
  WHERE is_primary = 1 AND is_hidden = 0;

CREATE TRIGGER IF NOT EXISTS trg_mail_drafts_state_insert
AFTER INSERT ON mail_drafts BEGIN
  INSERT INTO mail_state_versions (user_id, version, updated_at)
  VALUES (NEW.user_id, 1, unixepoch())
  ON CONFLICT(user_id) DO UPDATE SET
    version = mail_state_versions.version + 1,
    updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_mail_drafts_state_delete
AFTER DELETE ON mail_drafts BEGIN
  INSERT INTO mail_state_versions (user_id, version, updated_at)
  VALUES (OLD.user_id, 1, unixepoch())
  ON CONFLICT(user_id) DO UPDATE SET
    version = mail_state_versions.version + 1,
    updated_at = excluded.updated_at;
END;
