import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../../app/types'
import { MicrosoftAccountStore, publicMicrosoftAccount } from './microsoft-store'
import type { MicrosoftAccount } from './microsoft-types'

function account(): MicrosoftAccount {
  return {
    id: 'microsoft_account_1',
    userId: 'user_1',
    name: 'Outlook',
    providedEmail: 'User@Outlook.com',
    normalizedEmail: 'user@outlook.com',
    authMode: 'oauth2',
    clientId: '00000000-0000-4000-8000-000000000000',
    authority: 'common',
    refreshToken: 'refresh-secret',
    accessToken: 'access-secret',
    accessTokenExpiresAt: 4_000,
    password: '',
    status: 'active',
    lastSyncedAt: null,
    nextSyncAt: 0,
    lastErrorCode: '',
    lastErrorAt: null,
    syncLeaseId: null,
    syncLeaseUntil: null,
    tokenLeaseId: null,
    tokenLeaseUntil: null,
    lastManualSyncAt: null,
    createdAt: 1_000,
    updatedAt: 1_000,
  }
}

describe('Microsoft account store', () => {
  it('stores encrypted credentials and exposes only masked public metadata', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const env = {
      MICROSOFT_CREDENTIALS_KEY: 'microsoft-store-key-longer-than-thirty-two-bytes',
      DB: {
        prepare: vi.fn((sql: string) => {
          const statement = {
            sql,
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
    await new MicrosoftAccountStore(env, value.userId).insert(value)
    const bindings = statements[0].bindings.map(String)
    expect(bindings).not.toContain('refresh-secret')
    expect(bindings).not.toContain('access-secret')
    expect(bindings.some((binding) => binding.startsWith('v1.'))).toBe(true)
    expect(publicMicrosoftAccount(value)).toMatchObject({
      email: 'user@outlook.com',
      clientIdMasked: '0000••••0000',
      hasCredential: true,
    })
    expect(JSON.stringify(publicMicrosoftAccount(value))).not.toContain('secret')
  })
})
