CREATE TABLE icloud_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  real_email TEXT NOT NULL DEFAULT '',
  icloud_email TEXT NOT NULL DEFAULT '',
  cookies_cipher TEXT NOT NULL DEFAULT '',
  host TEXT NOT NULL DEFAULT 'icloud.com'
    CHECK (host IN ('icloud.com', 'icloud.com.cn')),
  app_password_cipher TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('active', 'pending', 'error')),
  alias_total INTEGER NOT NULL DEFAULT 0 CHECK (alias_total >= 0),
  alias_active INTEGER NOT NULL DEFAULT 0 CHECK (alias_active >= 0),
  last_validated TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_icloud_accounts_user
  ON icloud_accounts(user_id, created_at);
