export async function ensureOutboundRateLimitSchema(db: D1Database): Promise<void> {
  const { results } = await db.prepare('PRAGMA table_info(users)').all<{ name: string }>()
  const columns = new Set(results.map((column) => column.name))
  const statements: D1PreparedStatement[] = []
  if (!columns.has('outbound_minute_limit')) {
    statements.push(db.prepare(
      `ALTER TABLE users ADD COLUMN outbound_minute_limit INTEGER CHECK (
        outbound_minute_limit IS NULL OR outbound_minute_limit BETWEEN 1 AND 100
      )`,
    ))
  }
  if (!columns.has('outbound_day_limit')) {
    statements.push(db.prepare(
      `ALTER TABLE users ADD COLUMN outbound_day_limit INTEGER CHECK (
        outbound_day_limit IS NULL OR outbound_day_limit BETWEEN 1 AND 10000
      )`,
    ))
  }
  if (statements.length) await db.batch(statements)
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS outbound_rate_limits (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        minute_started_at INTEGER NOT NULL,
        minute_count INTEGER NOT NULL,
        day_started_at INTEGER NOT NULL,
        day_count INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ),
    db.prepare(
      `INSERT OR IGNORE INTO settings (key, value) VALUES
       ('outbound_rate_limit_enabled', '1'),
       ('outbound_rate_limit_minute', '10'),
       ('outbound_rate_limit_day', '200')`,
    ),
  ])
}
