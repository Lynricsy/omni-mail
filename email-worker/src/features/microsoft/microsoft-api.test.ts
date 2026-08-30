import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env, SessionUser } from '../../app/types'
import {
  claimMicrosoftValidationAttempt,
  importMicrosoftAccounts,
  listMicrosoftAccounts,
  MICROSOFT_VALIDATION_ATTEMPTS,
} from './microsoft-account-api'
import { microsoftResponseError } from './microsoft-api-shared'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import {
  getMicrosoftMessage,
  listMicrosoftMessages,
} from './microsoft-message-api'

const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: false, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

const key = 'microsoft-api-key-that-is-longer-than-thirty-two-bytes'

function request(body: unknown): Request {
  return new Request('https://mail.example.com/api/microsoft/accounts/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('Microsoft mail API boundaries', () => {
  it('reports the feature as disabled without reading D1', async () => {
    const response = await listMicrosoftAccounts({} as Env, user)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ enabled: false, accounts: [] })
  })

  it('rejects password-only imports without remote access', async () => {
    const env = {
      MICROSOFT_CREDENTIALS_KEY: key,
      DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) },
    } as unknown as Env
    const response = await importMicrosoftAccounts(env, user, request({
      accounts: [{
        email: 'user@outlook.com', authMode: 'password', password: 'password',
        persistPasswordConfirmed: true,
      }],
    }), '192.0.2.1')
    expect(response.status).toBe(207)
    await expect(response.json()).resolves.toMatchObject({
      results: [{ status: 'error', code: 'password_auth_removed' }],
    })
  })

  it('does not insert OAuth credentials when Microsoft rejects the refresh token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'invalid_grant' }, { status: 400 })))
    const statements: string[] = []
    const env = {
      MICROSOFT_CREDENTIALS_KEY: key,
      DB: { prepare(sql: string) {
        statements.push(sql)
        return { bind: () => ({
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 1 } }),
        }) }
      } },
    } as unknown as Env
    const response = await importMicrosoftAccounts(env, user, request({ accounts: [{
      email: 'user@outlook.com', authMode: 'oauth2', refreshToken: 'refresh-secret',
      clientId: '00000000-0000-4000-8000-000000000000', authority: 'common',
      password: 'combination-password-must-be-discarded',
      persistPasswordConfirmed: true,
    }] }), '192.0.2.1')
    const body = await response.json()
    expect(response.status).toBe(207)
    expect(body).toMatchObject({ results: [{ status: 'error', code: 'invalid_grant' }] })
    expect(JSON.stringify(body)).not.toContain('refresh-secret')
    expect(JSON.stringify(body)).not.toContain('combination-password')
    expect(statements.some((sql) => /INSERT INTO microsoft_imap_accounts/i.test(sql))).toBe(false)
  })

  it('allows two complete 25-account validation batches before rate limiting', async () => {
    let attempts = 0
    const env = { DB: { prepare: () => ({ bind: (...bindings: unknown[]) => ({
      run: async () => {
        const maximum = Number(bindings.at(-1))
        if (attempts >= maximum) return { meta: { changes: 0 } }
        attempts += 1
        return { meta: { changes: 1 } }
      },
    }) }) } } as unknown as Env
    expect(MICROSOFT_VALIDATION_ATTEMPTS).toBe(50)
    for (let index = 0; index < 50; index += 1) {
      await claimMicrosoftValidationAttempt(env, user.id, '192.0.2.1', 1_787_500_000)
    }
    await expect(claimMicrosoftValidationAttempt(
      env, user.id, '192.0.2.1', 1_787_500_000,
    )).rejects.toMatchObject({ status: 429, code: 'validation_rate_limited' })
  })

  it('keeps OAuth2 and password IMAP rejection messages distinct', async () => {
    const error = new ImapConnectionError(400, 'IMAP authentication failed', true)
    const oauth = await microsoftResponseError(error, 'oauth2').json<Record<string, string>>()
    const password = await microsoftResponseError(error, 'password').json<Record<string, string>>()
    expect(oauth).toMatchObject({ code: 'imap_access_rejected' })
    expect(oauth.error).toContain('OAuth2')
    expect(oauth.error).not.toContain('密码 LOGIN')
    expect(password).toMatchObject({ code: 'basic_auth_rejected' })
    expect(password.error).toContain('OAuth2 四字段凭据')
  })

  it('scopes local list and detail queries by the authenticated user', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const env = {
      MICROSOFT_CREDENTIALS_KEY: key,
      DB: { prepare(sql: string) {
        return { bind: (...bindings: unknown[]) => {
          statements.push({ sql, bindings })
          return {
            all: async () => ({ results: [] }),
            first: async () => null,
          }
        } }
      } },
    } as unknown as Env
    const list = await listMicrosoftMessages(
      env,
      user,
      new Request('https://mail.example.com/api/microsoft/messages?q=Security%20100%25_'),
    )
    const detail = await getMicrosoftMessage(env, user, 'other-account', 'other-message')
    expect(list.status).toBe(200)
    expect(detail.status).toBe(404)
    expect(statements[0].sql).toContain('a.user_id = ?')
    expect(statements[0].bindings[0]).toBe(user.id)
    expect(statements[0].sql).toContain('instr(lower(m.subject), ?) > 0')
    expect(statements[1].sql).toContain('WHERE a.user_id = ? AND a.id = ? AND m.id = ?')
    expect(statements[1].bindings).toEqual([user.id, 'other-account', 'other-message'])
  })

  it('rejects list limits outside 1..200 before querying messages', async () => {
    const prepare = vi.fn()
    const response = await listMicrosoftMessages(
      { MICROSOFT_CREDENTIALS_KEY: key, DB: { prepare } } as unknown as Env,
      user,
      new Request('https://mail.example.com/api/microsoft/messages?limit=201'),
    )
    expect(response.status).toBe(400)
    expect(prepare).not.toHaveBeenCalled()
  })
})
