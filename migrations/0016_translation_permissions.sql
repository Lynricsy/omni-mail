ALTER TABLE users
  ADD COLUMN can_translate INTEGER NOT NULL DEFAULT 1
  CHECK (can_translate IN (0, 1));

ALTER TABLE temporary_invites
  ADD COLUMN can_translate INTEGER NOT NULL DEFAULT 1
  CHECK (can_translate IN (0, 1));
