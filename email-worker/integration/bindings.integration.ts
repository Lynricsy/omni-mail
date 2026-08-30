import { env } from 'cloudflare:workers'
import {
  applyD1Migrations,
  createExecutionContext,
  createMessageBatch,
  getQueueResult,
} from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { sha256 } from '../src/features/auth/session/auth'
import { permanentlyDeleteMessage } from '../src/features/messages/message-storage'
import { EXTENSION_DEVICE_SCOPES } from '../src/features/auth/tokens/token-scope'
import type { Env as OmniMailEnv, MailQueueJob } from '../src/app/types'

declare global {
  namespace Cloudflare {
    interface Env extends OmniMailEnv {
      TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>
    }
  }
}

beforeAll(async () => {
  await applyD1Migrations(
    env.DB,
    env.TEST_MIGRATIONS.filter(({ name }) => (
      Number(name.slice(0, 4)) <= 14
    )),
  )
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('schema_version', '2026-07-29-p5-outbound-rate-limit-admin', unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run()
  await env.DB.prepare('DROP TABLE d1_migrations').run()
  await env.DB.prepare(
    `INSERT INTO users (
      id, email, display_name, password_hash, role, mailbox_limit,
      storage_quota_bytes, can_create_mailboxes, can_reply
    ) VALUES ('worker-user', 'worker@example.com', 'Worker', 'test', 'user', 1, 1024, 1, 0)`,
  ).run()
})

describe('Worker storage bindings', () => {
  it('recovers a legacy database through iCloud and preserves Wrangler history', async () => {
    const beforeScopes = await env.DB.prepare(
      "SELECT 1 AS present FROM pragma_table_info('device_sessions') WHERE name = 'scopes' LIMIT 1",
    ).first<{ present: number }>()
    const beforeICloud = await env.DB.prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'icloud_accounts' LIMIT 1",
    ).first<{ present: number }>()
    expect(beforeScopes).toBeNull()
    expect(beforeICloud).toBeNull()

    const response = await worker.fetch(
      new Request('https://mail.example.com/api/config'),
      env,
      createExecutionContext(),
    )
    expect(response.status).toBe(200)

    const columns = await env.DB.prepare(
      "SELECT name, dflt_value FROM pragma_table_info('device_sessions') WHERE name = 'scopes'",
    ).first<{ name: string; dflt_value: string }>()
    expect(columns).toMatchObject({ name: 'scopes', dflt_value: "'*'" })
    const recovered = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM d1_migrations
       WHERE name IN (
         '0018_schema_baseline_and_message_indexes.sql',
         '0019_extension_authorization.sql',
         '0020_device_token_scopes.sql'
       )`,
    ).first<{ count: number }>()
    const authorizationTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'extension_authorization_codes'",
    ).first<{ name: string }>()
    expect(recovered?.count).toBe(3)
    expect(authorizationTable?.name).toBe('extension_authorization_codes')

    const accountTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'icloud_accounts'",
    ).first<{ name: string }>()
    expect(accountTable?.name).toBe('icloud_accounts')

    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
    const migrations = await env.DB.prepare(
      `SELECT name, COUNT(*) AS total FROM d1_migrations
       WHERE name IN (
         '0020_device_token_scopes.sql', '0021_icloud_accounts.sql',
         '0022_consistency_guards.sql'
       )
       GROUP BY name ORDER BY name`,
    ).all<{ name: string; total: number }>()
    expect(migrations.results).toEqual([
      { name: '0020_device_token_scopes.sql', total: 1 },
      { name: '0021_icloud_accounts.sql', total: 1 },
      { name: '0022_consistency_guards.sql', total: 1 },
    ])
  })

  it('enforces consistency guards and advances draft synchronization', async () => {
    const pendingTable = await env.DB.prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = 'pending_object_deletions'`,
    ).first<{ name: string }>()
    expect(pendingTable?.name).toBe('pending_object_deletions')

    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO domains (name, is_active) VALUES ('example.com', 1)"),
      env.DB.prepare(
        `INSERT OR IGNORE INTO mailboxes (address, user_id, is_primary, is_active)
         VALUES ('worker@example.com', 'worker-user', 1, 1)`,
      ),
    ])
    await expect(env.DB.prepare(
      `INSERT INTO mailboxes (address, user_id, is_primary, is_active)
       VALUES ('second@example.com', 'worker-user', 1, 1)`,
    ).run()).rejects.toThrow()

    await env.DB.prepare(
      `INSERT INTO mail_drafts (
        id, user_id, mailbox_address, recipient_address, subject, body_text,
        created_at, updated_at
      ) VALUES ('draft-sync', 'worker-user', 'worker@example.com', '', '', '', 1, 1)`,
    ).run()
    const afterInsert = await env.DB.prepare(
      "SELECT version FROM mail_state_versions WHERE user_id = 'worker-user'",
    ).first<{ version: number }>()
    await env.DB.prepare("DELETE FROM mail_drafts WHERE id = 'draft-sync'").run()
    const afterDelete = await env.DB.prepare(
      "SELECT version FROM mail_state_versions WHERE user_id = 'worker-user'",
    ).first<{ version: number }>()
    expect(afterDelete!.version).toBe(afterInsert!.version + 1)
  })

  it('releases storage only once when the same message is deleted concurrently', async () => {
    await env.MAIL_BUCKET.put('raw/concurrent-delete.eml', 'message')
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE users SET storage_used_bytes = 100 WHERE id = 'worker-user'",
      ),
      env.DB.prepare(
        `INSERT INTO messages (
          id, mailbox_address, direction, status, folder, sender_address,
          recipients_json, subject, received_at, raw_key, size, quota_bytes, stored_bytes
        ) VALUES (
          'concurrent-delete', 'worker@example.com', 'incoming', 'ready', 'trash',
          'sender@example.net', '[]', 'Delete me', unixepoch(),
          'raw/concurrent-delete.eml', 100, 100, 100
        )`,
      ),
    ])
    const message = {
      id: 'concurrent-delete', raw_key: 'raw/concurrent-delete.eml',
      body_key: null, quota_bytes: 100,
    }
    const deleted = await Promise.all([
      permanentlyDeleteMessage(env, 'worker-user', message),
      permanentlyDeleteMessage(env, 'worker-user', message),
    ])
    const usage = await env.DB.prepare(
      "SELECT storage_used_bytes FROM users WHERE id = 'worker-user'",
    ).first<{ storage_used_bytes: number }>()

    expect(deleted.filter(Boolean)).toHaveLength(1)
    expect(usage?.storage_used_bytes).toBe(0)
  })

  it('uses real D1, R2, and Queue bindings inside workerd', async () => {
    await env.MAIL_BUCKET.put('integration/body.json', JSON.stringify({ text: 'hello' }))
    await env.MAIL_QUEUE.send({ kind: 'index', messageId: 'integration-message' } satisfies MailQueueJob)
    const batch = createMessageBatch<MailQueueJob>('omnimail-mail', [{
      id: 'queue-message',
      timestamp: new Date(),
      attempts: 1,
      body: { kind: 'index', messageId: 'missing-message' },
    }])
    const context = createExecutionContext()
    await worker.queue(batch, env)
    const queueResult = await getQueueResult(batch, context)

    const user = await env.DB.prepare(
      "SELECT email FROM users WHERE id = 'worker-user'",
    ).first<{ email: string }>()
    const object = await env.MAIL_BUCKET.get('integration/body.json')

    expect(user?.email).toBe('worker@example.com')
    await expect(object?.json()).resolves.toEqual({ text: 'hello' })
    expect(queueResult.explicitAcks).toContain('queue-message')
  })

  it('enforces extension scopes at the Worker API boundary', async () => {
    const accessToken = `om_at_${'a'.repeat(43)}`
    const refreshToken = `om_rt_${'b'.repeat(43)}`
    const now = Math.floor(Date.now() / 1000)
    await env.DB.prepare(
      `INSERT INTO device_sessions (
        id, user_id, device_name, access_token_hash, access_expires_at,
        refresh_token_hash, refresh_expires_at, last_used_at, scopes
      ) VALUES (?, ?, 'OmniMail Float', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      'extension-session',
      'worker-user',
      await sha256(accessToken),
      now + 900,
      await sha256(refreshToken),
      now + 3600,
      now,
      EXTENSION_DEVICE_SCOPES,
    ).run()

    const request = (path: string) => new Request(`https://mail.example.com${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const context = createExecutionContext()
    const allowed = await worker.fetch(request('/api/mailboxes'), env, context)
    const denied = await worker.fetch(request('/api/admin/users'), env, context)
    const iCloudAllowed = await worker.fetch(
      request('/api/icloud/accounts'),
      env,
      createExecutionContext(),
    )

    expect(allowed.status).toBe(200)
    expect(denied.status).toBe(403)
    expect(iCloudAllowed.status).toBe(200)
    await expect(denied.json()).resolves.toMatchObject({
      error: '当前设备令牌没有执行此操作的权限。',
    })

    const refreshed = await worker.fetch(new Request(
      'https://mail.example.com/api/auth/token/refresh',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      },
    ), env, context)
    await expect(refreshed.json()).resolves.toMatchObject({
      scopes: EXTENSION_DEVICE_SCOPES.split(' '),
    })
    const session = await env.DB.prepare(
      "SELECT scopes FROM device_sessions WHERE id = 'extension-session'",
    ).first<{ scopes: string }>()
    expect(session?.scopes).toBe(EXTENSION_DEVICE_SCOPES)
  })

  it('rate-limits setup and hides the administrator email after completion', async () => {
    const before = await worker.fetch(
      new Request('https://mail.example.com/api/config'),
      env,
      createExecutionContext(),
    )
    await expect(before.json()).resolves.toMatchObject({
      setupComplete: false,
      superAdminEmail: 'owner@example.com',
    })

    const setupRequest = (token: string, ip: string) => new Request(
      'https://mail.example.com/api/setup',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify({
          displayName: 'Owner',
          password: 'strong-password',
          setupToken: token,
        }),
      },
    )
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const rejected = await worker.fetch(
        setupRequest('wrong-token', '192.0.2.1'),
        env,
        createExecutionContext(),
      )
      expect(rejected.status).toBe(403)
    }
    const limited = await worker.fetch(
      setupRequest('wrong-token', '192.0.2.1'),
      env,
      createExecutionContext(),
    )
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0)

    const completed = await worker.fetch(
      setupRequest(env.SETUP_TOKEN!, '192.0.2.2'),
      env,
      createExecutionContext(),
    )
    expect(completed.status).toBe(201)
    const after = await worker.fetch(
      new Request('https://mail.example.com/api/config'),
      env,
      createExecutionContext(),
    )
    await expect(after.json()).resolves.toMatchObject({
      setupComplete: true,
      superAdminEmail: '',
    })
  })
})
