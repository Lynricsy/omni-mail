export async function ensureSecuritySchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS admin_totp (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        encrypted_secret TEXT NOT NULL,
        enabled_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL UNIQUE,
        used_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user
       ON mfa_recovery_codes(user_id, used_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS mfa_challenges (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel TEXT NOT NULL CHECK (channel IN ('browser', 'linuxdo')),
        expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expiry
       ON mfa_challenges(expires_at)`,
    ),
  ])
}
