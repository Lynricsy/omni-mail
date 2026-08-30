-- Runtime recovery applies this migration to recognized legacy databases.

CREATE TABLE IF NOT EXISTS oauth_identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (provider, subject),
  UNIQUE (provider, user_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_identities_user
  ON oauth_identities(user_id);

CREATE TABLE IF NOT EXISTS admin_totp (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret TEXT NOT NULL,
  enabled_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user
  ON mfa_recovery_codes(user_id, used_at);

CREATE TABLE IF NOT EXISTS mfa_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('browser', 'linuxdo')),
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expiry
  ON mfa_challenges(expires_at);

CREATE TABLE IF NOT EXISTS resend_webhook_events (
  event_id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_created
  ON resend_webhook_events(created_at);
CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_provider
  ON resend_webhook_events(provider_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_messages_mail_state_update;
CREATE TRIGGER trg_messages_mail_state_update
AFTER UPDATE OF status, folder, sender_name, sender_address, subject, preview,
  received_at, sent_at, attachment_count, is_read, is_starred, processing_error,
  delivery_status
ON messages BEGIN
  INSERT INTO mail_state_versions (user_id, version, updated_at)
  SELECT mb.user_id, 1, unixepoch() FROM mailboxes mb
   WHERE mb.address = NEW.mailbox_address
  ON CONFLICT(user_id) DO UPDATE SET
    version = mail_state_versions.version + 1,
    updated_at = excluded.updated_at;
END;

ALTER TABLE messages ADD COLUMN sort_at INTEGER
  GENERATED ALWAYS AS (COALESCE(received_at, sent_at, created_at)) VIRTUAL;

CREATE INDEX IF NOT EXISTS idx_messages_folder_sort
  ON messages(folder, sort_at DESC, id DESC, direction, mailbox_address);
CREATE INDEX IF NOT EXISTS idx_messages_starred_sort
  ON messages(is_starred, sort_at DESC, id DESC, folder, mailbox_address);

INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES ('backup_database_identity', lower(hex(randomblob(16))), unixepoch());
DELETE FROM settings WHERE key = 'schema_version';

PRAGMA optimize;
