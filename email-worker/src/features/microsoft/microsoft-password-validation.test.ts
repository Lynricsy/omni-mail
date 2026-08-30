import { connect } from 'cloudflare:sockets'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env, SessionUser } from '../../app/types'
import { importMicrosoftAccounts } from './microsoft-account-api'

vi.mock('cloudflare:sockets', () => ({ connect: vi.fn() }))

const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: false, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

function socketScript(lines: string[]) {
  const writes: Uint8Array[] = []
  return {
    socket: {
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`${lines.join('\r\n')}\r\n`))
        },
      }),
      writable: new WritableStream<Uint8Array>({ write(value) { writes.push(value.slice()) } }),
      opened: Promise.resolve({ remoteAddress: null, localAddress: null }),
      closed: new Promise<void>(() => undefined),
      close: vi.fn(async () => undefined),
    } as unknown as Socket,
    commands: () => new TextDecoder().decode(Uint8Array.from(
      writes.flatMap((value) => [...value]),
    )),
  }
}

describe('Microsoft OAuth2 combination password storage', () => {
  beforeEach(() => vi.mocked(connect).mockReset())

  it('uses XOAUTH2 and stores a confirmed combination password only as ciphertext', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      access_token: 'access-token', refresh_token: 'rotated-refresh', expires_in: 3600,
      scope: 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access',
    })))
    const fixture = socketScript([
      '* OK Microsoft ready',
      '* CAPABILITY IMAP4rev1 AUTH=XOAUTH2',
      'A0001 OK CAPABILITY',
      'A0002 OK AUTHENTICATE completed',
      '* LIST (\\Inbox) "/" "INBOX"',
      'A0003 OK LIST completed',
      '* 1 EXISTS',
      '* OK [UIDVALIDITY 42] valid',
      'A0004 OK EXAMINE completed',
      '* BYE',
      'A0005 OK LOGOUT',
    ])
    vi.mocked(connect).mockReturnValue(fixture.socket)
    const calls: Array<{ sql: string; bindings: unknown[] }> = []
    const env = {
      MICROSOFT_CREDENTIALS_KEY: 'microsoft-key-that-is-longer-than-thirty-two-bytes',
      DB: {
        prepare(sql: string) {
          return { bind: (...bindings: unknown[]) => {
            calls.push({ sql, bindings })
            return {
              all: async () => ({ results: [] }),
              run: async () => ({ meta: { changes: 1 } }),
            }
          } }
        },
        batch: async () => [],
      },
      MAIL_QUEUE: { send: vi.fn(async () => undefined) },
    } as unknown as Env
    const password = 'combination-password-secret'
    const response = await importMicrosoftAccounts(env, user, new Request(
      'https://mail.example.com/api/microsoft/accounts/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: [{
          email: 'user@outlook.com', authMode: 'oauth2', password,
          persistPasswordConfirmed: true, refreshToken: 'refresh-token',
          clientId: '00000000-0000-4000-8000-000000000000', authority: 'common',
        }] }),
      },
    ), '192.0.2.1')
    const text = await response.text()
    const insert = calls.find(({ sql }) => /INSERT INTO microsoft_imap_accounts/i.test(sql))
    expect(response.status).toBe(201)
    expect(text).not.toContain(password)
    expect(insert?.bindings).not.toContain(password)
    expect(insert?.bindings[11]).toBe('')
    expect(insert?.bindings[12]).toEqual(expect.stringMatching(/^v1\./))
    expect(fixture.commands()).toContain('AUTHENTICATE XOAUTH2 ')
    expect(fixture.commands()).not.toMatch(/\bLOGIN\b/)
  })
})
