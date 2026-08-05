ALTER TABLE messages
  ADD COLUMN processing_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN last_failed_at INTEGER;

CREATE TABLE IF NOT EXISTS mail_state_versions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TRIGGER IF NOT EXISTS trg_messages_mail_state_insert
AFTER INSERT ON messages BEGIN
  INSERT INTO mail_state_versions (user_id, version, updated_at)
  SELECT mb.user_id, 1, unixepoch() FROM mailboxes mb
   WHERE mb.address = NEW.mailbox_address
  ON CONFLICT(user_id) DO UPDATE SET
    version = mail_state_versions.version + 1,
    updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_mail_state_update
AFTER UPDATE OF status, folder, sender_name, sender_address, subject, preview,
  received_at, sent_at, attachment_count, is_read, is_starred, processing_error
ON messages BEGIN
  INSERT INTO mail_state_versions (user_id, version, updated_at)
  SELECT mb.user_id, 1, unixepoch() FROM mailboxes mb
   WHERE mb.address = NEW.mailbox_address
  ON CONFLICT(user_id) DO UPDATE SET
    version = mail_state_versions.version + 1,
    updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_mail_state_delete
AFTER DELETE ON messages BEGIN
  INSERT INTO mail_state_versions (user_id, version, updated_at)
  SELECT mb.user_id, 1, unixepoch() FROM mailboxes mb
   WHERE mb.address = OLD.mailbox_address
  ON CONFLICT(user_id) DO UPDATE SET
    version = mail_state_versions.version + 1,
    updated_at = excluded.updated_at;
END;
