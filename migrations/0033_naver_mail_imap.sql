-- NAVER Mail read-only IMAP schema.
CREATE TABLE IF NOT EXISTS naver_mail_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  naver_id TEXT NOT NULL COLLATE NOCASE,
  app_password_cipher TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'syncing', 'credential_error', 'error')),
  uid_validity INTEGER,
  uid_next INTEGER,
  last_seen_uid INTEGER NOT NULL DEFAULT 0 CHECK (last_seen_uid >= 0),
  last_synced_at INTEGER,
  next_sync_at INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT NOT NULL DEFAULT '',
  last_error_at INTEGER,
  sync_lease_id TEXT,
  sync_lease_until INTEGER,
  last_manual_sync_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, email),
  UNIQUE (user_id, naver_id)
);

CREATE INDEX IF NOT EXISTS idx_naver_mail_accounts_due
  ON naver_mail_accounts(next_sync_at, status, id);

CREATE INDEX IF NOT EXISTS idx_naver_mail_accounts_user
  ON naver_mail_accounts(user_id, created_at, id);

CREATE TABLE IF NOT EXISTS naver_mail_messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES naver_mail_accounts(id) ON DELETE CASCADE,
  imap_uid INTEGER NOT NULL CHECK (imap_uid > 0),
  uid_validity INTEGER NOT NULL CHECK (uid_validity > 0),
  message_id_header TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  sender_address TEXT NOT NULL DEFAULT '',
  recipients_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  preview TEXT NOT NULL DEFAULT '',
  internal_date INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  flags_json TEXT NOT NULL DEFAULT '[]',
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  is_starred INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0, 1)),
  has_attachments INTEGER NOT NULL DEFAULT 0 CHECK (has_attachments IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (account_id, uid_validity, imap_uid)
);

CREATE INDEX IF NOT EXISTS idx_naver_mail_messages_account_date
  ON naver_mail_messages(account_id, internal_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_naver_mail_messages_date
  ON naver_mail_messages(internal_date DESC, id DESC, account_id);

CREATE TABLE IF NOT EXISTS naver_mail_validation_limits (
  identity_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
