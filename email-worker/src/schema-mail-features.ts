import { ensureOutboundRateLimitSchema } from './schema-outbound-rate-limit'

export async function ensureMailFeatureSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS message_search (
        message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS mail_drafts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mailbox_address TEXT NOT NULL COLLATE NOCASE
          REFERENCES mailboxes(address) ON DELETE CASCADE,
        recipient_address TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '',
        body_text TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_mail_drafts_user_updated
       ON mail_drafts(user_id, updated_at DESC, id DESC)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS mail_draft_attachments (
        id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL REFERENCES mail_drafts(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL CHECK (size > 0),
        r2_key TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_mail_draft_attachments_draft
       ON mail_draft_attachments(draft_id, created_at, id)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS message_translations (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        target_language TEXT NOT NULL,
        source_language TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        model TEXT NOT NULL,
        r2_key TEXT NOT NULL UNIQUE,
        size INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (message_id, target_language)
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS translation_rate_limits (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        window_started_at INTEGER NOT NULL,
        request_count INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ),
  ])
  const { results: legacyTables } = await db.prepare(
    `SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name IN ('drafts', 'draft_attachments')`,
  ).all<{ name: string }>()
  const legacy = new Set(legacyTables.map((table) => table.name))
  if (legacy.has('drafts')) {
    const migration = [
      db.prepare(
        `INSERT OR IGNORE INTO mail_drafts (
           id, user_id, mailbox_address, recipient_address, subject, body_text,
           created_at, updated_at
         )
         SELECT 'legacy:' || user_id, user_id, mailbox_address, recipient_address,
                subject, body_text, updated_at * 1000, updated_at * 1000
           FROM drafts`,
      ),
    ]
    if (legacy.has('draft_attachments')) {
      migration.push(
        db.prepare(
          `INSERT OR IGNORE INTO mail_draft_attachments (
             id, draft_id, filename, content_type, size, r2_key, created_at
           )
           SELECT id, 'legacy:' || user_id, filename, content_type, size, r2_key,
                  created_at * 1000
             FROM draft_attachments`,
        ),
      )
    }
    await db.batch(migration)
  }
  await ensureOutboundRateLimitSchema(db)
}
