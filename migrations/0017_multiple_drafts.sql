CREATE TABLE IF NOT EXISTS mail_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mailbox_address TEXT NOT NULL COLLATE NOCASE
    REFERENCES mailboxes(address) ON DELETE CASCADE,
  recipient_address TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mail_drafts_user_updated
  ON mail_drafts(user_id, updated_at DESC, id DESC);

INSERT OR IGNORE INTO mail_drafts (
  id, user_id, mailbox_address, recipient_address, subject, body_text,
  created_at, updated_at
)
SELECT 'legacy:' || user_id, user_id, mailbox_address, recipient_address,
       subject, body_text, updated_at * 1000, updated_at * 1000
  FROM drafts;

CREATE TABLE IF NOT EXISTS mail_draft_attachments (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES mail_drafts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0),
  r2_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mail_draft_attachments_draft
  ON mail_draft_attachments(draft_id, created_at, id);

INSERT OR IGNORE INTO mail_draft_attachments (
  id, draft_id, filename, content_type, size, r2_key, created_at
)
SELECT id, 'legacy:' || user_id, filename, content_type, size, r2_key,
       created_at * 1000
  FROM draft_attachments;

DROP TABLE draft_attachments;
DROP TABLE drafts;
