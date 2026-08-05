CREATE TABLE IF NOT EXISTS temporary_invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  domain_name TEXT NOT NULL REFERENCES domains(name) ON DELETE RESTRICT,
  expires_at INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses IN (0, 1)),
  use_count INTEGER NOT NULL DEFAULT 0,
  address_mode TEXT NOT NULL DEFAULT 'self_selected'
    CHECK (address_mode IN ('assigned', 'self_selected')),
  assigned_address TEXT COLLATE NOCASE,
  account_lifetime_hours INTEGER NOT NULL DEFAULT 24
    CHECK (account_lifetime_hours BETWEEN 1 AND 720),
  mailbox_limit INTEGER NOT NULL DEFAULT 1 CHECK (mailbox_limit BETWEEN 1 AND 100),
  can_create_mailboxes INTEGER NOT NULL DEFAULT 0 CHECK (can_create_mailboxes IN (0, 1)),
  can_reply INTEGER NOT NULL DEFAULT 0 CHECK (can_reply IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_temporary_invites_token ON temporary_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_temporary_invites_created ON temporary_invites(created_at DESC);
