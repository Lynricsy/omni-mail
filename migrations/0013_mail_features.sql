CREATE TABLE IF NOT EXISTS message_search (
  message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS drafts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mailbox_address TEXT NOT NULL COLLATE NOCASE
    REFERENCES mailboxes(address) ON DELETE CASCADE,
  recipient_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS draft_attachments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES drafts(user_id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0),
  r2_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_draft_attachments_user
  ON draft_attachments(user_id, created_at);
