CREATE TABLE microsoft_imap_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provided_email TEXT NOT NULL,
  normalized_email TEXT NOT NULL COLLATE NOCASE,
  auth_mode TEXT NOT NULL CHECK (auth_mode IN ('oauth2', 'password')),
  client_id TEXT NOT NULL DEFAULT '',
  authority TEXT NOT NULL DEFAULT 'common',
  refresh_token_cipher TEXT NOT NULL DEFAULT '',
  access_token_cipher TEXT NOT NULL DEFAULT '',
  access_token_expires_at INTEGER,
  password_cipher TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_validation'
    CHECK (status IN (
      'pending_validation', 'active', 'syncing', 'credential_error',
      'permission_error', 'error'
    )),
  last_synced_at INTEGER,
  next_sync_at INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT NOT NULL DEFAULT '',
  last_error_at INTEGER,
  sync_lease_id TEXT,
  sync_lease_until INTEGER,
  token_lease_id TEXT,
  token_lease_until INTEGER,
  last_manual_sync_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, normalized_email),
  CHECK (
    (auth_mode = 'oauth2' AND client_id != '' AND refresh_token_cipher != ''
      AND password_cipher = '')
    OR
    (auth_mode = 'password' AND client_id = '' AND refresh_token_cipher = ''
      AND access_token_cipher = '' AND access_token_expires_at IS NULL
      AND password_cipher != '')
  )
);

CREATE INDEX idx_microsoft_imap_accounts_due
  ON microsoft_imap_accounts(next_sync_at, status, id);
CREATE INDEX idx_microsoft_imap_accounts_user
  ON microsoft_imap_accounts(user_id, created_at, id);

CREATE TABLE microsoft_imap_folders (
  account_id TEXT NOT NULL REFERENCES microsoft_imap_accounts(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  display_name TEXT NOT NULL,
  flags_json TEXT NOT NULL DEFAULT '[]',
  special_use TEXT NOT NULL DEFAULT '',
  uid_validity INTEGER,
  last_uid INTEGER NOT NULL DEFAULT 0 CHECK (last_uid >= 0),
  last_listed_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, path)
);

CREATE INDEX idx_microsoft_imap_folders_account
  ON microsoft_imap_folders(account_id, special_use, display_name);

CREATE TABLE microsoft_imap_messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES microsoft_imap_accounts(id) ON DELETE CASCADE,
  folder_path TEXT NOT NULL,
  uid_validity INTEGER NOT NULL CHECK (uid_validity > 0),
  imap_uid INTEGER NOT NULL CHECK (imap_uid > 0),
  internet_message_id TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  sender_address TEXT NOT NULL DEFAULT '',
  recipients_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  preview TEXT NOT NULL DEFAULT '',
  received_at INTEGER NOT NULL,
  sent_at INTEGER,
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  flags_json TEXT NOT NULL DEFAULT '[]',
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  is_starred INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0, 1)),
  has_attachments INTEGER NOT NULL DEFAULT 0 CHECK (has_attachments IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (account_id, folder_path, uid_validity, imap_uid),
  FOREIGN KEY (account_id, folder_path)
    REFERENCES microsoft_imap_folders(account_id, path) ON DELETE CASCADE
);

CREATE INDEX idx_microsoft_imap_messages_folder_date
  ON microsoft_imap_messages(account_id, folder_path, received_at DESC, id DESC);
CREATE INDEX idx_microsoft_imap_messages_date
  ON microsoft_imap_messages(received_at DESC, id DESC, account_id);

CREATE TABLE microsoft_imap_validation_limits (
  identity_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
