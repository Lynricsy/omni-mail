export async function ensureOAuthTables(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS oauth_identities (
        provider TEXT NOT NULL,
        subject TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        avatar_url TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (provider, subject),
        UNIQUE (provider, user_id)
      )`,
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_id)',
    ),
  ])
}
