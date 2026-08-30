import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../app/types'
import { microsoftAccessToken } from './microsoft-token-manager'
import type { MicrosoftAccount } from './microsoft-types'

function account(): MicrosoftAccount {
  return {
    id: 'microsoft_account_1', userId: 'user_1', name: 'Outlook',
    providedEmail: 'user@outlook.com', normalizedEmail: 'user@outlook.com',
    authMode: 'oauth2', clientId: '00000000-0000-4000-8000-000000000000',
    authority: 'common', refreshToken: 'refresh-token', accessToken: 'cached-token',
    accessTokenExpiresAt: 5_000, password: '', status: 'active', lastSyncedAt: null,
    nextSyncAt: 0, lastErrorCode: '', lastErrorAt: null, syncLeaseId: null,
    syncLeaseUntil: null, tokenLeaseId: null, tokenLeaseUntil: null,
    lastManualSyncAt: null, createdAt: 1_000, updatedAt: 1_000,
  }
}

describe('Microsoft access token manager', () => {
  it('reuses a cached token before the expiry skew without touching D1', async () => {
    const prepare = vi.fn(() => { throw new Error('D1 should not be used') })
    await expect(microsoftAccessToken(
      { DB: { prepare } } as unknown as Env,
      account(),
      { now: 1_000 },
    )).resolves.toBe('cached-token')
    expect(prepare).not.toHaveBeenCalled()
  })

  it('claims a lease, rotates both tokens atomically, and clears the lease', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const env = {
      MICROSOFT_CREDENTIALS_KEY: 'microsoft-token-key-longer-than-thirty-two-bytes',
      DB: {
        prepare: vi.fn((sql: string) => {
          const statement = {
            bindings: [] as unknown[],
            bind(...bindings: unknown[]) {
              statement.bindings = bindings
              return statement
            },
            async run() {
              statements.push({ sql, bindings: statement.bindings })
              return { meta: { changes: 1 } }
            },
          }
          return statement
        }),
      },
    } as unknown as Env
    const value = account()
    value.accessTokenExpiresAt = 1_010
    const fetcher = vi.fn(async () => Response.json({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      scope: 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access',
    }))
    await expect(microsoftAccessToken(env, value, { now: 1_000, fetcher }))
      .resolves.toBe('new-access')
    expect(statements[0].sql).toContain('token_lease_id')
    expect(statements[1].sql).toContain('refresh_token_cipher = ?')
    expect(statements[1].sql).toContain('token_lease_id = NULL')
    expect(statements[1].bindings.map(String)).not.toContain('new-refresh')
    expect(value).toMatchObject({
      refreshToken: 'new-refresh',
      accessToken: 'new-access',
      accessTokenExpiresAt: 4_600,
    })
  })
})
