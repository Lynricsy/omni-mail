import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import { updateLinuxDoMailCredential } from './linux-do-mail-api'
import { decryptLinuxDoMailCredential } from './linux-do-mail-credentials'
import type { LinuxDoMailAccountRow } from './linux-do-mail-types'
import type { Env, SessionUser } from '../../app/types'

const imap = vi.hoisted(() => ({
  open: vi.fn(async () => undefined),
  test: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
}))

vi.mock('./linux-do-mail-imap', () => ({
  LinuxDoMailImapClient: class {
    open = imap.open
    test = imap.test
    close = imap.close
  },
}))
vi.mock('../../shared/audit/audit', () => ({ writeAudit: vi.fn(async () => undefined) }))

const key = 'test-key-that-is-longer-than-thirty-two-characters'
const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: false, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

function request(password: string): Request {
  return new Request('https://mail.example.com/api/linux-do-mail/account/credential', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
}

async function fixture() {
  const context = `${user.id}:linuxdo-mail-1:password`
  const originalCipher = 'corrupted-old-cipher'
  const row: LinuxDoMailAccountRow = {
    id: 'linuxdo-mail-1', user_id: user.id, username: 'member@linux.do',
    password_cipher: originalCipher, status: 'active',
    last_validated: '2026-08-22T00:00:00.000Z', last_error: '',
    created_at: '2026-08-22T00:00:00.000Z',
  }
  const updates: unknown[][] = []
  const env = {
    LINUX_DO_MAIL_CREDENTIALS_KEY: key,
    DB: {
      prepare(sql: string) {
        return { bind: (...values: unknown[]) => ({
          first: async () => row,
          run: async () => {
            if (sql.startsWith('UPDATE linux_do_mail_accounts')) updates.push(values)
            return { meta: { changes: 1 } }
          },
        }) }
      },
    },
  } as unknown as Env
  return { context, env, originalCipher, updates }
}

describe('Linux DO Mail credential replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    imap.open.mockResolvedValue(undefined)
    imap.test.mockResolvedValue(undefined)
    imap.close.mockResolvedValue(undefined)
  })

  it('validates before replacing the encrypted credential without decrypting the old value', async () => {
    const { context, env, originalCipher, updates } = await fixture()
    const response = await updateLinuxDoMailCredential(
      env, user, request('working-new-token'), '192.0.2.1',
    )

    expect(response.status).toBe(200)
    expect(JSON.stringify(await response.json())).not.toContain('working-new-token')
    expect(imap.test).toHaveBeenCalledOnce()
    expect(updates).toHaveLength(1)
    expect(updates[0].slice(-2)).toEqual(['linuxdo-mail-1', user.id])
    expect(updates[0][0]).not.toBe(originalCipher)
    await expect(decryptLinuxDoMailCredential(
      env, String(updates[0][0]), context,
    )).resolves.toBe('working-new-token')
  })

  it('keeps the old ciphertext when remote validation fails', async () => {
    const { env, updates } = await fixture()
    imap.test.mockRejectedValueOnce(new ImapConnectionError(400, '登录失败。', true))

    const response = await updateLinuxDoMailCredential(
      env, user, request('invalid-new-token'), '192.0.2.1',
    )

    expect(response.status).toBe(400)
    expect(updates).toHaveLength(0)
    expect(imap.close).toHaveBeenCalledOnce()
  })
})
