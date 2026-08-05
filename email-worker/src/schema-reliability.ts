import { ensureMailFeatureSchema } from './schema-mail-features'

export async function ensureReliabilitySchema(db: D1Database): Promise<void> {
  const { results } = await db.prepare(
    'PRAGMA table_info(messages)',
  ).all<{ name: string }>()
  const columns = new Set(results.map((column) => column.name))
  const statements: D1PreparedStatement[] = []
  if (!columns.has('delivery_status')) {
    statements.push(db.prepare(
      `ALTER TABLE messages ADD COLUMN delivery_status TEXT CHECK (
        delivery_status IS NULL OR delivery_status IN (
          'queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'suppressed'
        )
      )`,
    ))
  }
  if (!columns.has('provider_event_at')) {
    statements.push(db.prepare('ALTER TABLE messages ADD COLUMN provider_event_at INTEGER'))
  }
  if (statements.length) await db.batch(statements)
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS resend_webhook_events (
      event_id TEXT PRIMARY KEY,
      message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
  ).run()
  const eventColumns = await db.prepare(
    'PRAGMA table_info(resend_webhook_events)',
  ).all<{ name: string }>()
  if (!eventColumns.results.some((column) => column.name === 'provider_id')) {
    await db.prepare(
      "ALTER TABLE resend_webhook_events ADD COLUMN provider_id TEXT NOT NULL DEFAULT ''",
    ).run()
  }
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_created
     ON resend_webhook_events(created_at)`,
  ).run()
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_provider
     ON resend_webhook_events(provider_id, created_at DESC)`,
  ).run()
  await ensureMailFeatureSchema(db)
}
