import { env } from 'cloudflare:workers'
import { applyD1Migrations, createExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { createSessionToken, storeSession } from '../src/features/auth/session/auth'
import type { Env as OmniMailEnv } from '../src/app/types'

declare global {
  namespace Cloudflare {
    interface Env extends OmniMailEnv {
      TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>
    }
  }
}

const ownerToken = createSessionToken()
const otherToken = createSessionToken()

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (
        id, email, display_name, password_hash, role, mailbox_limit,
        storage_quota_bytes, can_create_mailboxes, can_reply
      ) VALUES ('icloud-owner', 'icloud-owner@example.com', 'Owner', 'test', 'user', 1, 1024, 1, 0)`,
    ),
    env.DB.prepare(
      `INSERT INTO users (
        id, email, display_name, password_hash, role, mailbox_limit,
        storage_quota_bytes, can_create_mailboxes, can_reply
      ) VALUES ('icloud-other', 'icloud-other@example.com', 'Other', 'test', 'user', 1, 1024, 1, 0)`,
    ),
  ])
  await Promise.all([
    storeSession(env.DB, 'icloud-owner', ownerToken),
    storeSession(env.DB, 'icloud-other', otherToken),
  ])
  const id = 'icloud-account-1'
  await env.DB.prepare(
    `INSERT INTO icloud_accounts (
      id, user_id, name, cookies_cipher, app_password_cipher, status,
      created_at, updated_at
    ) VALUES (?, 'icloud-owner', 'Personal', ?, ?, 'active', ?, ?)`,
  ).bind(
    id,
    'not-a-valid-cookie-cipher',
    'not-a-valid-password-cipher',
    new Date().toISOString(),
    new Date().toISOString(),
  ).run()
})

function request(path: string, token = ownerToken): Request {
  return new Request(`https://mail.example.com${path}`, {
    headers: { Cookie: `omnimail_session=${token}` },
  })
}

function patchRequest(path: string, body: unknown, token = ownerToken): Request {
  return new Request(`https://mail.example.com${path}`, {
    method: 'PATCH',
    headers: {
      Cookie: `omnimail_session=${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('iCloud account API', () => {
  it('lists only public metadata for the authenticated owner', async () => {
    const response = await worker.fetch(
      request('/api/icloud/accounts'),
      env,
      createExecutionContext(),
    )
    const result = await response.json() as { accounts: unknown[] }

    expect(response.status).toBe(200)
    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0]).toMatchObject({
      id: 'icloud-account-1',
      hasCookies: true,
      hasAppPassword: true,
    })
    expect(JSON.stringify(result)).not.toContain('never-return')
    expect(JSON.stringify(result)).not.toContain('icloud-owner')
  })

  it('isolates accounts by user ownership', async () => {
    const response = await worker.fetch(
      request('/api/icloud/accounts', otherToken),
      env,
      createExecutionContext(),
    )
    await expect(response.json()).resolves.toEqual({ accounts: [] })
  })

  it('renames only an account owned by the authenticated user', async () => {
    const denied = await worker.fetch(
      patchRequest('/api/icloud/accounts/icloud-account-1', { name: 'Other name' }, otherToken),
      env,
      createExecutionContext(),
    )
    expect(denied.status).toBe(404)

    const response = await worker.fetch(
      patchRequest('/api/icloud/accounts/icloud-account-1', { name: 'Work iCloud' }),
      env,
      createExecutionContext(),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, name: 'Work iCloud' })
    const account = await env.DB.prepare(
      'SELECT name FROM icloud_accounts WHERE id = ?',
    ).bind('icloud-account-1').first<{ name: string }>()
    expect(account?.name).toBe('Work iCloud')
  })
})
