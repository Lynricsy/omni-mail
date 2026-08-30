import { NAVER_MAIL_MIGRATION, NAVER_MAIL_RECOVERY } from './schema-migration-naver'
import { YANDEX_MAIL_MIGRATION, YANDEX_MAIL_RECOVERY } from './schema-migration-yandex'
import {
  QQ_MAIL_IDENTITIES_MIGRATION,
  QQ_MAIL_IDENTITIES_RECOVERY,
} from './schema-migration-qq-identities'
import {
  EXTERNAL_MAIL_INDEX_MIGRATION,
  EXTERNAL_MAIL_INDEX_RECOVERY,
} from './schema-migration-external-mail'

const ICLOUD_MIGRATION = '0021_icloud_accounts.sql'
const CONSISTENCY_MIGRATION = '0022_consistency_guards.sql'
const LINUX_DO_MAIL_MIGRATION = '0023_linux_do_mail_accounts.sql'
const LINUX_DO_MAIL_OUTBOUND_MIGRATION = '0024_linux_do_mail_outbound.sql'
const GMAIL_MIGRATION = '0025_gmail_imap.sql'
const GMAIL_UNLIMITED_MIGRATION = '0026_gmail_unlimited_accounts.sql'
const MICROSOFT_MIGRATION = '0027_microsoft_imap.sql'
const MICROSOFT_COMBINATION_PASSWORD_MIGRATION = '0028_microsoft_oauth_combination_password.sql'
const QQ_MAIL_MIGRATION = '0029_qq_mail_imap.sql'
const QQ_MAIL_SMTP_MIGRATION = '0030_qq_mail_smtp.sql'
export const REQUIRED_MIGRATION = EXTERNAL_MAIL_INDEX_MIGRATION
export const WRANGLER_MIGRATION_NAMES = [
  '0001_initial.sql',
  '0002_domains.sql',
  '0003_temporary_invites.sql',
  '0004_device_sessions.sql',
  '0005_audit_log_index.sql',
  '0006_external_registration.sql',
  '0007_registration_security.sql',
  '0008_storage_policy.sql',
  '0009_mail_operations.sql',
  '0010_account_invites.sql',
  '0011_unassigned_mail.sql',
  '0012_mail_safety.sql',
  '0013_mail_features.sql',
  '0014_outbound_rate_limits.sql',
  '0015_message_translations.sql',
  '0016_translation_permissions.sql',
  '0017_multiple_drafts.sql',
  '0018_schema_baseline_and_message_indexes.sql',
  '0019_extension_authorization.sql',
  '0020_device_token_scopes.sql',
  ICLOUD_MIGRATION,
  CONSISTENCY_MIGRATION,
  LINUX_DO_MAIL_MIGRATION,
  LINUX_DO_MAIL_OUTBOUND_MIGRATION,
  GMAIL_MIGRATION,
  GMAIL_UNLIMITED_MIGRATION,
  MICROSOFT_MIGRATION,
  MICROSOFT_COMBINATION_PASSWORD_MIGRATION,
  QQ_MAIL_MIGRATION,
  QQ_MAIL_SMTP_MIGRATION,
  QQ_MAIL_IDENTITIES_MIGRATION,
  NAVER_MAIL_MIGRATION,
  YANDEX_MAIL_MIGRATION,
  REQUIRED_MIGRATION,
] as const
export const LEGACY_BASELINES: Record<string, number> = {
  '2026-07-29-p5-outbound-rate-limit-admin': 14,
  '2026-08-01-p2-translation-permissions': 16,
  '2026-08-03-p3-multiple-drafts': 17,
}
export const RECOVERABLE_MIGRATIONS = [
  {
    name: '0015_message_translations.sql',
    statements: [
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
      `CREATE TABLE IF NOT EXISTS translation_rate_limits (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        window_started_at INTEGER NOT NULL,
        request_count INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ],
  },
  {
    name: '0016_translation_permissions.sql',
    statements: [
      `ALTER TABLE users
       ADD COLUMN can_translate INTEGER NOT NULL DEFAULT 1
       CHECK (can_translate IN (0, 1))`,
      `ALTER TABLE temporary_invites
       ADD COLUMN can_translate INTEGER NOT NULL DEFAULT 1
       CHECK (can_translate IN (0, 1))`,
    ],
  },
  {
    name: '0017_multiple_drafts.sql',
    statements: [
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
      `CREATE INDEX IF NOT EXISTS idx_mail_drafts_user_updated
       ON mail_drafts(user_id, updated_at DESC, id DESC)`,
      `INSERT OR IGNORE INTO mail_drafts (
        id, user_id, mailbox_address, recipient_address, subject, body_text,
        created_at, updated_at
      )
      SELECT 'legacy:' || user_id, user_id, mailbox_address, recipient_address,
             subject, body_text, updated_at * 1000, updated_at * 1000
        FROM drafts`,
      `CREATE TABLE IF NOT EXISTS mail_draft_attachments (
        id TEXT PRIMARY KEY,
        draft_id TEXT NOT NULL REFERENCES mail_drafts(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL CHECK (size > 0),
        r2_key TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_mail_draft_attachments_draft
       ON mail_draft_attachments(draft_id, created_at, id)`,
      `INSERT OR IGNORE INTO mail_draft_attachments (
        id, draft_id, filename, content_type, size, r2_key, created_at
      )
      SELECT id, 'legacy:' || user_id, filename, content_type, size, r2_key,
             created_at * 1000
        FROM draft_attachments`,
      'DROP TABLE draft_attachments',
      'DROP TABLE drafts',
    ],
  },
  {
    name: '0018_schema_baseline_and_message_indexes.sql',
    statements: [
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
      'CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_id)',
      `CREATE TABLE IF NOT EXISTS admin_totp (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        encrypted_secret TEXT NOT NULL,
        enabled_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
      `CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL UNIQUE,
        used_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
      `CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user
       ON mfa_recovery_codes(user_id, used_at)`,
      `CREATE TABLE IF NOT EXISTS mfa_challenges (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel TEXT NOT NULL CHECK (channel IN ('browser', 'linuxdo')),
        expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
      `CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expiry
       ON mfa_challenges(expires_at)`,
      `CREATE TABLE IF NOT EXISTS resend_webhook_events (
        event_id TEXT PRIMARY KEY,
        message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
        provider_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
      `CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_created
       ON resend_webhook_events(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_provider
       ON resend_webhook_events(provider_id, created_at DESC)`,
      'DROP TRIGGER IF EXISTS trg_messages_mail_state_update',
      `CREATE TRIGGER trg_messages_mail_state_update
       AFTER UPDATE OF status, folder, sender_name, sender_address, subject, preview,
         received_at, sent_at, attachment_count, is_read, is_starred, processing_error,
         delivery_status
       ON messages BEGIN
         INSERT INTO mail_state_versions (user_id, version, updated_at)
         SELECT mb.user_id, 1, unixepoch() FROM mailboxes mb
          WHERE mb.address = NEW.mailbox_address
         ON CONFLICT(user_id) DO UPDATE SET
           version = mail_state_versions.version + 1,
           updated_at = excluded.updated_at;
       END`,
      `ALTER TABLE messages ADD COLUMN sort_at INTEGER
       GENERATED ALWAYS AS (COALESCE(received_at, sent_at, created_at)) VIRTUAL`,
      `CREATE INDEX IF NOT EXISTS idx_messages_folder_sort
       ON messages(folder, sort_at DESC, id DESC, direction, mailbox_address)`,
      `CREATE INDEX IF NOT EXISTS idx_messages_starred_sort
       ON messages(is_starred, sort_at DESC, id DESC, folder, mailbox_address)`,
      `INSERT OR IGNORE INTO settings (key, value, updated_at)
       VALUES ('backup_database_identity', lower(hex(randomblob(16))), unixepoch())`,
      "DELETE FROM settings WHERE key = 'schema_version'",
      'PRAGMA optimize',
    ],
  },
  {
    name: '0019_extension_authorization.sql',
    statements: [
      `CREATE TABLE extension_authorization_codes (
        code_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
      `CREATE INDEX idx_extension_authorization_expiry
       ON extension_authorization_codes(expires_at, used_at)`,
    ],
  },
  {
    name: '0020_device_token_scopes.sql',
    statements: [
      "ALTER TABLE device_sessions ADD COLUMN scopes TEXT NOT NULL DEFAULT '*'",
    ],
  },
  {
    name: ICLOUD_MIGRATION,
    statements: [
      `CREATE TABLE IF NOT EXISTS icloud_accounts (
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
      )`,
      `CREATE INDEX IF NOT EXISTS idx_icloud_accounts_user
       ON icloud_accounts(user_id, created_at)`,
    ],
  },
  {
    name: CONSISTENCY_MIGRATION,
    statements: [
      `CREATE TABLE IF NOT EXISTS pending_object_deletions (
        object_key TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_mailboxes_one_primary
       ON mailboxes(user_id) WHERE is_primary = 1 AND is_hidden = 0`,
      `CREATE TRIGGER IF NOT EXISTS trg_mail_drafts_state_insert
       AFTER INSERT ON mail_drafts BEGIN
         INSERT INTO mail_state_versions (user_id, version, updated_at)
         VALUES (NEW.user_id, 1, unixepoch())
         ON CONFLICT(user_id) DO UPDATE SET
           version = mail_state_versions.version + 1,
           updated_at = excluded.updated_at;
       END`,
      `CREATE TRIGGER IF NOT EXISTS trg_mail_drafts_state_delete
       AFTER DELETE ON mail_drafts BEGIN
         INSERT INTO mail_state_versions (user_id, version, updated_at)
         VALUES (OLD.user_id, 1, unixepoch())
         ON CONFLICT(user_id) DO UPDATE SET
           version = mail_state_versions.version + 1,
           updated_at = excluded.updated_at;
       END`,
    ],
  },
  {
    name: LINUX_DO_MAIL_MIGRATION,
    statements: [
      `CREATE TABLE IF NOT EXISTS linux_do_mail_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        username TEXT NOT NULL COLLATE NOCASE,
        password_cipher TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'error')),
        last_validated TEXT NOT NULL DEFAULT '',
        last_error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_linux_do_mail_accounts_user
       ON linux_do_mail_accounts(user_id, created_at)`,
    ],
  },
  {
    name: LINUX_DO_MAIL_OUTBOUND_MIGRATION,
    statements: [
      `INSERT INTO mailboxes (
        address, user_id, is_primary, is_active, created_at, is_hidden
      )
      SELECT username, user_id, 0, 1, unixepoch(), 1
      FROM linux_do_mail_accounts
      WHERE NOT EXISTS (
        SELECT 1 FROM mailboxes WHERE address = linux_do_mail_accounts.username
      )`,
    ],
  },
  {
    name: GMAIL_MIGRATION,
    statements: [
      `CREATE TABLE IF NOT EXISTS gmail_imap_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE,
        app_password_cipher TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'syncing', 'credential_error', 'error')),
        uid_validity INTEGER,
        last_seen_uid INTEGER NOT NULL DEFAULT 0 CHECK (last_seen_uid >= 0),
        last_synced_at INTEGER,
        next_sync_at INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT NOT NULL DEFAULT '',
        last_error_at INTEGER,
        sync_lease_id TEXT,
        sync_lease_until INTEGER,
        last_manual_sync_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (user_id, email)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_gmail_imap_accounts_due
       ON gmail_imap_accounts(next_sync_at, status, id)`,
      `CREATE INDEX IF NOT EXISTS idx_gmail_imap_accounts_user
       ON gmail_imap_accounts(user_id, created_at, id)`,
      `CREATE TRIGGER IF NOT EXISTS gmail_imap_accounts_limit
       BEFORE INSERT ON gmail_imap_accounts
       WHEN (SELECT COUNT(*) FROM gmail_imap_accounts WHERE user_id = NEW.user_id) >= 5
       BEGIN
         SELECT RAISE(ABORT, 'gmail_account_limit');
       END`,
      `CREATE TABLE IF NOT EXISTS gmail_imap_messages (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES gmail_imap_accounts(id) ON DELETE CASCADE,
        gmail_message_id TEXT NOT NULL,
        gmail_thread_id TEXT NOT NULL DEFAULT '',
        imap_uid INTEGER NOT NULL CHECK (imap_uid > 0),
        uid_validity INTEGER NOT NULL CHECK (uid_validity > 0),
        message_id_header TEXT NOT NULL DEFAULT '',
        sender_name TEXT NOT NULL DEFAULT '',
        sender_address TEXT NOT NULL DEFAULT '',
        recipients_json TEXT NOT NULL DEFAULT '[]',
        cc_json TEXT NOT NULL DEFAULT '[]',
        subject TEXT NOT NULL DEFAULT '',
        preview TEXT NOT NULL DEFAULT '',
        internal_date INTEGER NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
        flags_json TEXT NOT NULL DEFAULT '[]',
        labels_json TEXT NOT NULL DEFAULT '[]',
        is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
        is_starred INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0, 1)),
        has_attachments INTEGER NOT NULL DEFAULT 0 CHECK (has_attachments IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (account_id, gmail_message_id),
        UNIQUE (account_id, uid_validity, imap_uid)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_gmail_imap_messages_account_date
       ON gmail_imap_messages(account_id, internal_date DESC, id DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_gmail_imap_messages_date
       ON gmail_imap_messages(internal_date DESC, id DESC, account_id)`,
      `CREATE TABLE IF NOT EXISTS gmail_imap_validation_limits (
        identity_hash TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        attempt_count INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ],
  },
  {
    name: GMAIL_UNLIMITED_MIGRATION,
    statements: ['DROP TRIGGER IF EXISTS gmail_imap_accounts_limit'],
  },
  {
    name: MICROSOFT_MIGRATION,
    statements: [
      `CREATE TABLE IF NOT EXISTS microsoft_imap_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        provided_email TEXT NOT NULL,
        normalized_email TEXT NOT NULL COLLATE NOCASE,
        auth_mode TEXT NOT NULL CHECK (auth_mode IN ('oauth2', 'password')),
        client_id TEXT NOT NULL DEFAULT '',
        authority TEXT NOT NULL DEFAULT 'common',
        refresh_token_cipher TEXT NOT NULL DEFAULT '',
        access_token_cipher TEXT NOT NULL DEFAULT '',
        access_token_expires_at INTEGER,
        password_cipher TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending_validation'
          CHECK (status IN (
            'pending_validation', 'active', 'syncing', 'credential_error',
            'permission_error', 'error'
          )),
        last_synced_at INTEGER,
        next_sync_at INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT NOT NULL DEFAULT '',
        last_error_at INTEGER,
        sync_lease_id TEXT,
        sync_lease_until INTEGER,
        token_lease_id TEXT,
        token_lease_until INTEGER,
        last_manual_sync_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (user_id, normalized_email),
        CHECK (
          (auth_mode = 'oauth2' AND client_id != '' AND refresh_token_cipher != ''
            AND password_cipher = '')
          OR
          (auth_mode = 'password' AND client_id = '' AND refresh_token_cipher = ''
            AND access_token_cipher = '' AND access_token_expires_at IS NULL
            AND password_cipher != '')
        )
      )`,
      `CREATE INDEX IF NOT EXISTS idx_microsoft_imap_accounts_due
       ON microsoft_imap_accounts(next_sync_at, status, id)`,
      `CREATE INDEX IF NOT EXISTS idx_microsoft_imap_accounts_user
       ON microsoft_imap_accounts(user_id, created_at, id)`,
      `CREATE TABLE IF NOT EXISTS microsoft_imap_folders (
        account_id TEXT NOT NULL REFERENCES microsoft_imap_accounts(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        display_name TEXT NOT NULL,
        flags_json TEXT NOT NULL DEFAULT '[]',
        special_use TEXT NOT NULL DEFAULT '',
        uid_validity INTEGER,
        last_uid INTEGER NOT NULL DEFAULT 0 CHECK (last_uid >= 0),
        last_listed_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, path)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_microsoft_imap_folders_account
       ON microsoft_imap_folders(account_id, special_use, display_name)`,
      `CREATE TABLE IF NOT EXISTS microsoft_imap_messages (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES microsoft_imap_accounts(id) ON DELETE CASCADE,
        folder_path TEXT NOT NULL,
        uid_validity INTEGER NOT NULL CHECK (uid_validity > 0),
        imap_uid INTEGER NOT NULL CHECK (imap_uid > 0),
        internet_message_id TEXT NOT NULL DEFAULT '',
        sender_name TEXT NOT NULL DEFAULT '',
        sender_address TEXT NOT NULL DEFAULT '',
        recipients_json TEXT NOT NULL DEFAULT '[]',
        cc_json TEXT NOT NULL DEFAULT '[]',
        subject TEXT NOT NULL DEFAULT '',
        preview TEXT NOT NULL DEFAULT '',
        received_at INTEGER NOT NULL,
        sent_at INTEGER,
        size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
        flags_json TEXT NOT NULL DEFAULT '[]',
        is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
        is_starred INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0, 1)),
        has_attachments INTEGER NOT NULL DEFAULT 0 CHECK (has_attachments IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (account_id, folder_path, uid_validity, imap_uid),
        FOREIGN KEY (account_id, folder_path)
          REFERENCES microsoft_imap_folders(account_id, path) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_microsoft_imap_messages_folder_date
       ON microsoft_imap_messages(account_id, folder_path, received_at DESC, id DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_microsoft_imap_messages_date
       ON microsoft_imap_messages(received_at DESC, id DESC, account_id)`,
      `CREATE TABLE IF NOT EXISTS microsoft_imap_validation_limits (
        identity_hash TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        attempt_count INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ],
  },
  {
    name: MICROSOFT_COMBINATION_PASSWORD_MIGRATION,
    statements: [
      `ALTER TABLE microsoft_imap_accounts
       ADD COLUMN combination_password_cipher TEXT NOT NULL DEFAULT ''`,
      `UPDATE microsoft_imap_accounts
       SET status = 'credential_error', last_error_code = 'password_auth_removed',
           last_error_at = unixepoch(), next_sync_at = 0, updated_at = unixepoch()
       WHERE auth_mode = 'password'`,
    ],
  },
  {
    name: QQ_MAIL_MIGRATION,
    statements: [
      `CREATE TABLE IF NOT EXISTS qq_mail_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE,
        authorization_code_cipher TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'syncing', 'credential_error', 'error')),
        uid_validity INTEGER,
        uid_next INTEGER,
        last_seen_uid INTEGER NOT NULL DEFAULT 0 CHECK (last_seen_uid >= 0),
        last_synced_at INTEGER,
        next_sync_at INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT NOT NULL DEFAULT '',
        last_error_at INTEGER,
        sync_lease_id TEXT,
        sync_lease_until INTEGER,
        last_manual_sync_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (user_id, email)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_qq_mail_accounts_due
       ON qq_mail_accounts(next_sync_at, status, id)`,
      `CREATE INDEX IF NOT EXISTS idx_qq_mail_accounts_user
       ON qq_mail_accounts(user_id, created_at, id)`,
      `CREATE TABLE IF NOT EXISTS qq_mail_messages (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES qq_mail_accounts(id) ON DELETE CASCADE,
        imap_uid INTEGER NOT NULL CHECK (imap_uid > 0),
        uid_validity INTEGER NOT NULL CHECK (uid_validity > 0),
        message_id_header TEXT NOT NULL DEFAULT '',
        sender_name TEXT NOT NULL DEFAULT '',
        sender_address TEXT NOT NULL DEFAULT '',
        recipients_json TEXT NOT NULL DEFAULT '[]',
        cc_json TEXT NOT NULL DEFAULT '[]',
        subject TEXT NOT NULL DEFAULT '',
        preview TEXT NOT NULL DEFAULT '',
        internal_date INTEGER NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
        flags_json TEXT NOT NULL DEFAULT '[]',
        is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
        is_starred INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0, 1)),
        has_attachments INTEGER NOT NULL DEFAULT 0 CHECK (has_attachments IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (account_id, uid_validity, imap_uid)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_qq_mail_messages_account_date
       ON qq_mail_messages(account_id, internal_date DESC, id DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_qq_mail_messages_date
       ON qq_mail_messages(internal_date DESC, id DESC, account_id)`,
      `CREATE TABLE IF NOT EXISTS qq_mail_validation_limits (
        identity_hash TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        attempt_count INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ],
  },
  {
    name: QQ_MAIL_SMTP_MIGRATION,
    statements: [
      `INSERT INTO mailboxes (
         address, user_id, is_primary, is_active, created_at, is_hidden
       )
       SELECT email, user_id, 0, 1, created_at, 1
       FROM qq_mail_accounts account
       WHERE account.id = (
         SELECT owner.id FROM qq_mail_accounts owner
         WHERE owner.email = account.email COLLATE NOCASE
         ORDER BY owner.created_at, owner.id LIMIT 1
       )
       AND NOT EXISTS (
         SELECT 1 FROM mailboxes WHERE address = account.email
       )`,
    ],
  },
  QQ_MAIL_IDENTITIES_RECOVERY,
  NAVER_MAIL_RECOVERY,
  YANDEX_MAIL_RECOVERY,
  EXTERNAL_MAIL_INDEX_RECOVERY,
] as const
