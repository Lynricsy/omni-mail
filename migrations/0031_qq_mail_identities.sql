CREATE TABLE IF NOT EXISTS qq_mail_identities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES qq_mail_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (account_id, email)
);

CREATE INDEX IF NOT EXISTS idx_qq_mail_identities_account
  ON qq_mail_identities(account_id, is_primary DESC, created_at, id);

INSERT OR IGNORE INTO qq_mail_identities (
  id, account_id, name, email, is_primary, created_at, updated_at
)
SELECT id, id, name, email, 1, created_at, updated_at
FROM qq_mail_accounts;
