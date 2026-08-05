ALTER TABLE messages
  ADD COLUMN reply_to_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE messages
  ADD COLUMN stored_bytes INTEGER NOT NULL DEFAULT 0;

UPDATE messages
SET stored_bytes = MAX(size, quota_bytes) + COALESCE((
  SELECT SUM(a.size) FROM attachments a WHERE a.message_id = messages.id
), 0)
WHERE stored_bytes = 0;
