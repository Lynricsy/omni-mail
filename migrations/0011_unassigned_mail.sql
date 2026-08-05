ALTER TABLE mailboxes
  ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0
    CHECK (is_hidden IN (0, 1));

ALTER TABLE messages
  ADD COLUMN delivered_to TEXT COLLATE NOCASE;

INSERT OR IGNORE INTO settings (key, value)
VALUES ('unassigned_mail_enabled', '0');
