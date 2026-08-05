ALTER TABLE temporary_invites
  ADD COLUMN account_role TEXT NOT NULL DEFAULT 'temporary'
    CHECK (account_role IN ('user', 'temporary'));
