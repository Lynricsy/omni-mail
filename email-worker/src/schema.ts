import { ensureOAuthTables } from './schema-oauth'
import { ensureReliabilitySchema } from './schema-reliability'
import { ensureSecuritySchema } from './schema-security'

const SCHEMA_SQL = String.raw`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('super_admin', 'admin', 'user', 'temporary')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  mailbox_limit INTEGER NOT NULL DEFAULT 1 CHECK (mailbox_limit BETWEEN 0 AND 100),
  storage_quota_bytes INTEGER NOT NULL DEFAULT 1073741824
    CHECK (storage_quota_bytes BETWEEN 0 AND 1099511627776),
  storage_used_bytes INTEGER NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0),
  can_create_mailboxes INTEGER NOT NULL DEFAULT 0 CHECK (can_create_mailboxes IN (0, 1)),
  can_reply INTEGER NOT NULL DEFAULT 0 CHECK (can_reply IN (0, 1)), can_translate INTEGER NOT NULL DEFAULT 1 CHECK (can_translate IN (0, 1)),
  temporary_expires_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS domains (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_domains_active ON domains(is_active, name);

CREATE TABLE IF NOT EXISTS temporary_invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  domain_name TEXT NOT NULL REFERENCES domains(name) ON DELETE RESTRICT,
  account_role TEXT NOT NULL DEFAULT 'temporary'
    CHECK (account_role IN ('user', 'temporary')),
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
  can_reply INTEGER NOT NULL DEFAULT 0 CHECK (can_reply IN (0, 1)), can_translate INTEGER NOT NULL DEFAULT 1 CHECK (can_translate IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_temporary_invites_token ON temporary_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_temporary_invites_created
  ON temporary_invites(created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS oauth_identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (provider, subject),
  UNIQUE (provider, user_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_id);

CREATE TABLE IF NOT EXISTS device_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  access_expires_at INTEGER NOT NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  refresh_expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_device_sessions_user
  ON device_sessions(user_id, revoked_at, last_used_at DESC);

CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS registration_attempts (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registration_attempts_window
  ON registration_attempts(window_started_at);

CREATE TABLE IF NOT EXISTS mailboxes (
  address TEXT PRIMARY KEY COLLATE NOCASE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_mailboxes_user ON mailboxes(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  mailbox_address TEXT NOT NULL COLLATE NOCASE REFERENCES mailboxes(address) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  status TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'failed', 'sent')),
  folder TEXT NOT NULL CHECK (folder IN ('inbox', 'sent', 'trash')),
  message_id TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  sender_name TEXT,
  sender_address TEXT NOT NULL,
  delivered_to TEXT COLLATE NOCASE,
  recipients_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]', reply_to_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  preview TEXT NOT NULL DEFAULT '',
  received_at INTEGER,
  sent_at INTEGER,
  raw_key TEXT,
  body_key TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  quota_bytes INTEGER NOT NULL DEFAULT 0 CHECK (quota_bytes >= 0),
  stored_bytes INTEGER NOT NULL DEFAULT 0 CHECK (stored_bytes >= 0),
  attachment_count INTEGER NOT NULL DEFAULT 0,
  has_html INTEGER NOT NULL DEFAULT 0 CHECK (has_html IN (0, 1)),
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  is_starred INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0, 1)),
  trashed_at INTEGER,
  purge_after INTEGER,
  processing_error TEXT,
  processing_attempts INTEGER NOT NULL DEFAULT 0,
  last_failed_at INTEGER,
  client_request_id TEXT UNIQUE,
  provider_id TEXT,
  delivery_status TEXT CHECK (delivery_status IS NULL OR delivery_status IN (
    'queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'suppressed'
  )),
  provider_event_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (mailbox_address, message_id)
);
CREATE INDEX IF NOT EXISTS idx_messages_mailbox_folder_date
  ON messages(mailbox_address, folder, received_at DESC, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_mailbox_starred
  ON messages(mailbox_address, is_starred, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_direction_received
  ON messages(direction, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_purge
  ON messages(purge_after, id);

CREATE TABLE IF NOT EXISTS mail_state_versions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  content_id TEXT,
  disposition TEXT NOT NULL DEFAULT 'attachment'
);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  ip TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_cursor
  ON audit_logs(created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual', 'enable')),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  object_key TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_backup_runs_started
  ON backup_runs(started_at DESC);
`

let schemaReady: Promise<void> | undefined
const SCHEMA_VERSION = '2026-08-03-p3-multiple-drafts'
async function ensureUnassignedMailColumns(db: D1Database): Promise<void> {
  const mailboxColumns = await db.prepare(
    'PRAGMA table_info(mailboxes)',
  ).all<{ name: string }>()
  if (!mailboxColumns.results.some((column) => column.name === 'is_hidden')) {
    await db.prepare(
      `ALTER TABLE mailboxes ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0
       CHECK (is_hidden IN (0, 1))`,
    ).run()
  }
  const messageColumns = await db.prepare(
    'PRAGMA table_info(messages)',
  ).all<{ name: string }>()
  if (!messageColumns.results.some((column) => column.name === 'delivered_to')) {
    await db.prepare(
      'ALTER TABLE messages ADD COLUMN delivered_to TEXT COLLATE NOCASE',
    ).run()
  }
  await db.prepare(
    `INSERT OR IGNORE INTO settings (key, value)
     VALUES ('unassigned_mail_enabled', '0')`,
  ).run()
}

async function ensureUserPolicyColumns(db: D1Database): Promise<void> {
  const { results } = await db.prepare('PRAGMA table_info(users)').all<{ name: string }>()
  const columns = new Set(results.map((column) => column.name))
  const statements: D1PreparedStatement[] = []
  let policyChanged = false
  let storageChanged = false
  if (!columns.has('mailbox_limit')) {
    policyChanged = true
    statements.push(db.prepare(
      'ALTER TABLE users ADD COLUMN mailbox_limit INTEGER NOT NULL DEFAULT 1',
    ))
  }
  if (!columns.has('can_create_mailboxes')) {
    policyChanged = true
    statements.push(db.prepare(
      'ALTER TABLE users ADD COLUMN can_create_mailboxes INTEGER NOT NULL DEFAULT 0',
    ))
  }
  if (!columns.has('can_reply')) {
    policyChanged = true
    statements.push(db.prepare(
      'ALTER TABLE users ADD COLUMN can_reply INTEGER NOT NULL DEFAULT 0',
    ))
  }
  if (!columns.has('can_translate')) statements.push(db.prepare('ALTER TABLE users ADD COLUMN can_translate INTEGER NOT NULL DEFAULT 1'))
  if (!columns.has('temporary_expires_at')) {
    statements.push(db.prepare('ALTER TABLE users ADD COLUMN temporary_expires_at INTEGER'))
  }
  if (!columns.has('deleted_at')) {
    statements.push(db.prepare('ALTER TABLE users ADD COLUMN deleted_at INTEGER'))
  }
  if (!columns.has('storage_quota_bytes')) {
    storageChanged = true
    statements.push(db.prepare(
      'ALTER TABLE users ADD COLUMN storage_quota_bytes INTEGER NOT NULL DEFAULT 1073741824',
    ))
  }
  if (!columns.has('storage_used_bytes')) {
    storageChanged = true
    statements.push(db.prepare(
      'ALTER TABLE users ADD COLUMN storage_used_bytes INTEGER NOT NULL DEFAULT 0',
    ))
  }
  if (!statements.length) return
  await db.batch(statements)
  if (storageChanged) {
    await db.prepare(
      `UPDATE users
          SET storage_quota_bytes = CASE
                WHEN role IN ('super_admin', 'admin') THEN 5368709120
                WHEN role = 'temporary' THEN 268435456
                ELSE storage_quota_bytes
              END,
              storage_used_bytes = COALESCE((
                SELECT SUM(msg.size)
                  FROM mailboxes mb
                  JOIN messages msg ON msg.mailbox_address = mb.address
                 WHERE mb.user_id = users.id
              ), 0)`,
    ).run()
  }
  if (!policyChanged) return
  await db.prepare(
    `UPDATE users
        SET mailbox_limit = MAX(
              mailbox_limit,
              CASE WHEN role IN ('super_admin', 'admin') THEN 20 ELSE 1 END,
              (SELECT COUNT(*) FROM mailboxes
                WHERE user_id = users.id AND is_hidden = 0)
            ),
            can_create_mailboxes = CASE WHEN role IN ('super_admin', 'admin') THEN 1 ELSE 0 END,
            can_reply = CASE WHEN role IN ('super_admin', 'admin') THEN 1 ELSE 0 END`,
  ).run()
}
async function ensureMessageStorageColumns(db: D1Database): Promise<void> {
  const { results } = await db.prepare(
    'PRAGMA table_info(messages)',
  ).all<{ name: string }>()
  const columns = new Set(results.map((column) => column.name))
  const statements: D1PreparedStatement[] = []
  if (!columns.has('quota_bytes')) {
    statements.push(db.prepare(
      'ALTER TABLE messages ADD COLUMN quota_bytes INTEGER NOT NULL DEFAULT 0',
    ))
  }
  if (!columns.has('stored_bytes')) statements.push(db.prepare('ALTER TABLE messages ADD COLUMN stored_bytes INTEGER NOT NULL DEFAULT 0'))
  if (!columns.has('reply_to_json')) statements.push(db.prepare("ALTER TABLE messages ADD COLUMN reply_to_json TEXT NOT NULL DEFAULT '[]'"))
  if (!columns.has('trashed_at')) {
    statements.push(db.prepare('ALTER TABLE messages ADD COLUMN trashed_at INTEGER'))
  }
  if (!columns.has('purge_after')) {
    statements.push(db.prepare('ALTER TABLE messages ADD COLUMN purge_after INTEGER'))
  }
  if (!columns.has('processing_attempts')) {
    statements.push(db.prepare(
      'ALTER TABLE messages ADD COLUMN processing_attempts INTEGER NOT NULL DEFAULT 0',
    ))
  }
  if (!columns.has('last_failed_at')) {
    statements.push(db.prepare('ALTER TABLE messages ADD COLUMN last_failed_at INTEGER'))
  }
  if (statements.length) await db.batch(statements)
  await db.prepare(
    'UPDATE messages SET quota_bytes = size WHERE quota_bytes = 0 AND size > 0',
  ).run()
  await db.prepare(`UPDATE messages SET stored_bytes = MAX(size, quota_bytes) + COALESCE((
    SELECT SUM(a.size) FROM attachments a WHERE a.message_id = messages.id
  ), 0) WHERE stored_bytes = 0`).run()
  await db.prepare(
    `UPDATE messages
        SET trashed_at = COALESCE(trashed_at, updated_at, created_at),
            purge_after = COALESCE(trashed_at, updated_at, created_at) + 2592000
      WHERE folder = 'trash' AND purge_after IS NULL`,
  ).run()
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_messages_purge
     ON messages(purge_after, id)`,
  ).run()
}

async function ensureMailStateVersions(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS mail_state_versions (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
  ).run()
  const upsert = (reference: 'NEW' | 'OLD') => `
    INSERT INTO mail_state_versions (user_id, version, updated_at)
    SELECT mb.user_id, 1, unixepoch()
      FROM mailboxes mb
     WHERE mb.address = ${reference}.mailbox_address
    ON CONFLICT(user_id) DO UPDATE SET
      version = mail_state_versions.version + 1,
      updated_at = excluded.updated_at;`
  await db.prepare(
    `CREATE TRIGGER IF NOT EXISTS trg_messages_mail_state_insert
     AFTER INSERT ON messages BEGIN ${upsert('NEW')} END`,
  ).run()
  await db.prepare(
    `CREATE TRIGGER IF NOT EXISTS trg_messages_mail_state_update
     AFTER UPDATE OF status, folder, sender_name, sender_address, subject, preview,
       received_at, sent_at, attachment_count, is_read, is_starred, processing_error,
       delivery_status
     ON messages BEGIN ${upsert('NEW')} END`,
  ).run()
  await db.prepare(
    `CREATE TRIGGER IF NOT EXISTS trg_messages_mail_state_delete
     AFTER DELETE ON messages BEGIN ${upsert('OLD')} END`,
  ).run()
}

async function ensureBackupRuns(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS backup_runs (
      id TEXT PRIMARY KEY,
      trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual', 'enable')),
      status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
      object_key TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      completed_at INTEGER
    )`,
  ).run()
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_backup_runs_started
     ON backup_runs(started_at DESC)`,
  ).run()
}

async function ensureDomains(db: D1Database): Promise<void> {
  const existed = await db.prepare(
    "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'domains'",
  ).first<{ present: number }>()
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS domains (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
  ).run()
  await db.prepare(
    'CREATE INDEX IF NOT EXISTS idx_domains_active ON domains(is_active, name)',
  ).run()
  if (!existed) {
    await db.prepare(
      `INSERT OR IGNORE INTO domains (name, is_active)
       SELECT DISTINCT LOWER(SUBSTR(address, INSTR(address, '@') + 1)), 1
         FROM mailboxes`,
    ).run()
  }
}

async function ensureTemporaryInvites(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS temporary_invites (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      domain_name TEXT NOT NULL REFERENCES domains(name) ON DELETE RESTRICT,
      account_role TEXT NOT NULL DEFAULT 'temporary'
        CHECK (account_role IN ('user', 'temporary')),
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
      can_reply INTEGER NOT NULL DEFAULT 0 CHECK (can_reply IN (0, 1)), can_translate INTEGER NOT NULL DEFAULT 1 CHECK (can_translate IN (0, 1)),
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      revoked_at INTEGER
    )`,
  ).run()
  const { results } = await db.prepare(
    'PRAGMA table_info(temporary_invites)',
  ).all<{ name: string }>()
  const columns = new Set(results.map((column) => column.name))
  if (!columns.has('account_role')) {
    await db.prepare(
      `ALTER TABLE temporary_invites ADD COLUMN account_role TEXT NOT NULL
       DEFAULT 'temporary' CHECK (account_role IN ('user', 'temporary'))`,
    ).run()
  }
  if (!columns.has('address_mode')) {
    await db.prepare(
      `ALTER TABLE temporary_invites ADD COLUMN address_mode TEXT NOT NULL
       DEFAULT 'self_selected' CHECK (address_mode IN ('assigned', 'self_selected'))`,
    ).run()
  }
  if (!columns.has('assigned_address')) {
    await db.prepare(
      'ALTER TABLE temporary_invites ADD COLUMN assigned_address TEXT COLLATE NOCASE',
    ).run()
  }
  if (!columns.has('account_lifetime_hours')) {
    await db.prepare(
      `ALTER TABLE temporary_invites ADD COLUMN account_lifetime_hours
       INTEGER NOT NULL DEFAULT 24 CHECK (account_lifetime_hours BETWEEN 1 AND 720)`,
    ).run()
  }
  if (!columns.has('can_translate')) await db.prepare('ALTER TABLE temporary_invites ADD COLUMN can_translate INTEGER NOT NULL DEFAULT 1').run()
  await db.prepare(
    'CREATE INDEX IF NOT EXISTS idx_temporary_invites_token ON temporary_invites(token_hash)',
  ).run()
  await db.prepare(
    'CREATE INDEX IF NOT EXISTS idx_temporary_invites_created ON temporary_invites(created_at DESC)',
  ).run()
}

async function ensureDeviceSessions(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS device_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_name TEXT NOT NULL,
      access_token_hash TEXT NOT NULL UNIQUE,
      access_expires_at INTEGER NOT NULL,
      refresh_token_hash TEXT NOT NULL UNIQUE,
      refresh_expires_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL DEFAULT (unixepoch()),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      revoked_at INTEGER
    )`,
  ).run()
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_device_sessions_user
     ON device_sessions(user_id, revoked_at, last_used_at DESC)`,
  ).run()
}

async function ensureRegistrationAttempts(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS registration_attempts (
      key_hash TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL,
      window_started_at INTEGER NOT NULL
    )`,
  ).run()
  await db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_registration_attempts_window
     ON registration_attempts(window_started_at)`,
  ).run()
}

export function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const exists = await db.prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'settings'",
      ).first<{ present: number }>()
      const version = exists
        ? await db.prepare(
          "SELECT value FROM settings WHERE key = 'schema_version'",
        ).first<{ value: string }>()
        : null
      if (version?.value === SCHEMA_VERSION) return
      if (!exists) {
        const statements = SCHEMA_SQL
          .split(';')
          .map((statement) => statement.trim())
          .filter((statement) => statement && !statement.startsWith('PRAGMA'))
          .map((statement) => db.prepare(statement))
        await db.batch(statements)
      } else {
        await ensureUnassignedMailColumns(db)
        await ensureUserPolicyColumns(db)
      }
      if (!exists) await ensureUnassignedMailColumns(db)
      await ensureMessageStorageColumns(db)
      await ensureMailStateVersions(db)
      await ensureReliabilitySchema(db)
      await ensureSecuritySchema(db)
      await ensureBackupRuns(db)
      await ensureDomains(db)
      await ensureTemporaryInvites(db)
      await ensureDeviceSessions(db)
      await ensureRegistrationAttempts(db)
      await ensureOAuthTables(db)
      await db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_messages_direction_received
         ON messages(direction, received_at DESC)`,
      ).run()
      await db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_audit_cursor
         ON audit_logs(created_at DESC, id DESC)`,
      ).run()
      await db.prepare(
        `INSERT OR IGNORE INTO settings (key, value, updated_at)
         VALUES ('backup_database_identity', ?, unixepoch())`,
      ).bind(crypto.randomUUID()).run()
      await db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('schema_version', ?, unixepoch())
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).bind(SCHEMA_VERSION).run()
    })().catch((error) => {
      schemaReady = undefined
      throw error
    })
  }
  return schemaReady
}
