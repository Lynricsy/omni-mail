import { describe, expect, it, vi } from 'vitest'
import {
  exchangeExtensionAuthorization,
  issueExtensionAuthorization,
  pkceChallenge,
  validAuthorizationInput,
} from './extension-authorization'
import { sha256 } from '../auth/session/auth'
import {
  OFFICIAL_CHROME_EXTENSION_ID,
  OFFICIAL_CHROME_EXTENSION_ORIGIN,
} from '../../app/middleware/origin-policy'
import { EXTENSION_DEVICE_SCOPES } from '../auth/tokens/token-scope'
import type { Env } from '../../app/types'

const clientId = 'abcdefghijklmnopabcdefghijklmnop'
const redirectUri = `https://${clientId}.chromiumapp.org/omnimail`
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

function environment(db?: D1Database): Env {
  return {
    DB: db || {} as D1Database,
    APP_ORIGINS: `chrome-extension://${clientId}`,
    SUPER_ADMIN_EMAIL: 'owner@example.com',
  } as Env
}

describe('extension authorization', () => {
  it('accepts only configured extension clients and their exact callback', () => {
    const input = {
      clientId,
      redirectUri,
      state: 'a'.repeat(43),
      codeChallenge: challenge,
    }
    expect(validAuthorizationInput(environment(), input)).toBe(true)
    expect(validAuthorizationInput(
      { ...environment(), APP_ORIGINS: undefined },
      input,
    )).toBe(false)
    expect(validAuthorizationInput(environment(), {
      ...input,
      redirectUri: `${redirectUri}/extra`,
    })).toBe(false)
  })

  it('keeps the official store client behind the global switch', () => {
    const input = {
      clientId: OFFICIAL_CHROME_EXTENSION_ID,
      redirectUri: `https://${OFFICIAL_CHROME_EXTENSION_ID}.chromiumapp.org/omnimail`,
      state: 'a'.repeat(43),
      codeChallenge: challenge,
    }
    const env = { ...environment(), APP_ORIGINS: OFFICIAL_CHROME_EXTENSION_ORIGIN }

    expect(validAuthorizationInput(env, input, false)).toBe(false)
    expect(validAuthorizationInput(env, input, true)).toBe(true)
  })

  it('implements the RFC 7636 S256 challenge', async () => {
    await expect(pkceChallenge(verifier)).resolves.toBe(challenge)
  })

  it('stores only a hash of the short-lived authorization code', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const db = {
      prepare: vi.fn((sql: string) => {
        const statement = { sql, bindings: [] as unknown[] }
        statements.push(statement)
        return {
          bind: vi.fn((...bindings: unknown[]) => {
            statement.bindings = bindings
            return { run: vi.fn(async () => ({ meta: { changes: 1 } })) }
          }),
        }
      }),
    } as unknown as D1Database
    const response = await issueExtensionAuthorization(
      environment(db),
      {
        id: 'user-1', email: 'owner@example.com', displayName: 'Owner', role: 'super_admin',
        mailboxLimit: 20, storageQuotaBytes: 1024, storageUsedBytes: 0,
        canCreateMailboxes: true, canReply: true, canTranslate: true,
        temporaryExpiresAt: null,
      },
      new Request('https://mail.example.com/api/auth/extension/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://mail.example.com',
        },
        body: JSON.stringify({
          clientId, redirectUri, state: 'a'.repeat(43), codeChallenge: challenge,
        }),
      }),
    )
    expect(response.status).toBe(200)
    const redirect = new URL((await response.json() as { redirectTo: string }).redirectTo)
    const code = redirect.searchParams.get('code') || ''
    const insert = statements.find(({ sql }) => sql.includes('INSERT INTO extension_authorization_codes'))
    expect(code).toMatch(/^om_ac_/)
    expect(insert?.bindings[0]).toBe(await sha256(code))
    expect(insert?.bindings).not.toContain(code)
  })

  it('requires the website origin before issuing an authorization code', async () => {
    const response = await issueExtensionAuthorization(
      environment(),
      {
        id: 'user-1', email: 'owner@example.com', displayName: 'Owner', role: 'admin',
        mailboxLimit: 20, storageQuotaBytes: 1024, storageUsedBytes: 0,
        canCreateMailboxes: true, canReply: true, canTranslate: true,
        temporaryExpiresAt: null,
      },
      new Request('https://mail.example.com/api/auth/extension/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: `chrome-extension://${clientId}`,
        },
        body: JSON.stringify({
          clientId, redirectUri, state: 'a'.repeat(43), codeChallenge: challenge,
        }),
      }),
    )
    expect(response.status).toBe(403)
  })

  it('exchanges a valid code once and rejects replay', async () => {
    let consumed = false
    const update = vi.fn(async () => {
      if (consumed) return { meta: { changes: 0 } }
      consumed = true
      return { meta: { changes: 1 } }
    })
    const row = {
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      expires_at: Math.floor(Date.now() / 1000) + 120,
      used_at: null,
      id: 'user-1',
      email: 'owner@example.com',
      display_name: 'Owner',
      role: 'admin',
      status: 'active',
      mailbox_limit: 20,
      storage_quota_bytes: 1024,
      storage_used_bytes: 0,
      can_create_mailboxes: 1,
      can_reply: 1,
      can_translate: 1,
      temporary_expires_at: null,
      deleted_at: null,
    }
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => sql.includes('FROM extension_authorization_codes')
            ? row
            : null),
          run: sql.startsWith('UPDATE extension_authorization_codes')
            ? update
            : vi.fn(async () => ({ meta: { changes: 1 } })),
        })),
      })),
    } as unknown as D1Database
    const code = `om_ac_${'a'.repeat(43)}`
    const makeRequest = () => new Request('https://mail.example.com/api/auth/extension/exchange', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: `chrome-extension://${clientId}`,
      },
      body: JSON.stringify({ code, codeVerifier: verifier, clientId, redirectUri }),
    })

    const first = await exchangeExtensionAuthorization(environment(db), makeRequest())
    expect(first.status).toBe(200)
    await expect(first.json()).resolves.toMatchObject({
      tokenType: 'Bearer',
      scopes: EXTENSION_DEVICE_SCOPES.split(' '),
      user: { id: 'user-1', role: 'super_admin' },
    })
    const replay = await exchangeExtensionAuthorization(environment(db), makeRequest())
    expect(replay.status).toBe(401)
    await expect(replay.json()).resolves.toMatchObject({ error: expect.stringContaining('已经使用') })
  })

  it('rejects exchange requests from a different extension origin', async () => {
    const response = await exchangeExtensionAuthorization(
      environment(),
      new Request('https://mail.example.com/api/auth/extension/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba' },
        body: JSON.stringify({
          code: `om_ac_${'a'.repeat(43)}`,
          codeVerifier: verifier,
          clientId,
          redirectUri,
        }),
      }),
    )
    expect(response.status).toBe(401)
  })
})
