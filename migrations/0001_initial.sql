PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('super_admin', 'admin', 'user', 'temporary')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  mailbox_limit INTEGER NOT NULL DEFAULT 1 CHECK (mailbox_limit BETWEEN 0 AND 100),
  can_create_mailboxes INTEGER NOT NULL DEFAULT 0 CHECK (can_create_mailboxes IN (0, 1)),
  can_reply INTEGER NOT NULL DEFAULT 0 CHECK (can_reply IN (0, 1)),
  temporary_expires_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mailboxes (
  address TEXT PRIMARY KEY COLLATE NOCASE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_mailboxes_user ON mailboxes(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  mailbox_address TEXT NOT NULL COLLATE NOCASE REFERENCES mailboxes(address) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  status TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'failed', 'sent')),
  folder TEXT NOT NULL CHECK (folder IN ('inbox', 'sent', 'trash')),
  message_id TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  sender_name TEXT,
  sender_address TEXT NOT NULL,
  recipients_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  preview TEXT NOT NULL DEFAULT '',
  received_at INTEGER,
  sent_at INTEGER,
  raw_key TEXT,
  body_key TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  has_html INTEGER NOT NULL DEFAULT 0 CHECK (has_html IN (0, 1)),
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  is_starred INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0, 1)),
  processing_error TEXT,
  client_request_id TEXT UNIQUE,
  provider_id TEXT,
  delivery_status TEXT CHECK (delivery_status IS NULL OR delivery_status IN (
    'queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'suppressed'
  )),
  provider_event_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (mailbox_address, message_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_mailbox_folder_date
  ON messages(mailbox_address, folder, received_at DESC, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_direction_received
  ON messages(direction, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_mailbox_starred
  ON messages(mailbox_address, is_starred, updated_at DESC);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  content_id TEXT,
  disposition TEXT NOT NULL DEFAULT 'attachment'
);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  ip TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
