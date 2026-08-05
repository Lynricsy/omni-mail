CREATE TABLE IF NOT EXISTS domains (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_domains_active ON domains(is_active, name);

INSERT OR IGNORE INTO domains (name, is_active)
SELECT DISTINCT LOWER(SUBSTR(address, INSTR(address, '@') + 1)), 1
FROM mailboxes;
