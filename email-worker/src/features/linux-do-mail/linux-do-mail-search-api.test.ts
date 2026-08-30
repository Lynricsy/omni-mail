import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listLinuxDoMailInbox } from './linux-do-mail-api'
import type { Env, SessionUser } from '../../app/types'

const mocks = vi.hoisted(() => ({
  listInbox: vi.fn(async () => [{
    id: '42', from: 'Sender <sender@example.com>', to: 'member@linux.do',
    subject: '求职进展', date: '2026-08-22T00:00:00.000Z', preview: '正文',
    body: '', html: '', isRead: true,
  }]),
  recordValidation: vi.fn(async () => undefined),
}))

vi.mock('./linux-do-mail-imap', () => ({
  LinuxDoMailImapClient: class {
    async open() {}
    async close() {}
    async listInbox(limit: number, query: string) {
      return mocks.listInbox(limit, query)
    }
  },
}))

vi.mock('./linux-do-mail-store', () => {
  class LinuxDoMailStoreError extends Error {
    constructor(readonly status: number, message: string) { super(message) }
  }
  return {
    LinuxDoMailStoreError,
    publicLinuxDoMailAccount: vi.fn(),
    LinuxDoMailAccountStore: class {
      async get() {
        return {
          id: 'linuxdo-mail-1', userId: 'user-1', username: 'member@linux.do',
          password: 'secret', status: 'active', lastValidated: '', lastError: '', createdAt: '',
        }
      }
      recordValidation = mocks.recordValidation
    },
  }
})

const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: true, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

describe('Linux DO Mail inbox search API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes the trimmed UTF-8 query to the IMAP search', async () => {
    const response = await listLinuxDoMailInbox(
      {} as Env,
      user,
      new Request('https://mail.example.com/api/linux-do-mail/inbox?q=%20%E6%B1%82%E8%81%8C%20'),
    )

    expect(response.status).toBe(200)
    expect(mocks.listInbox).toHaveBeenCalledWith(20, '求职')
    expect(mocks.recordValidation).toHaveBeenCalledWith('linuxdo-mail-1')
  })

  it('rejects oversized queries before opening IMAP', async () => {
    const query = 'a'.repeat(121)
    const response = await listLinuxDoMailInbox(
      {} as Env,
      user,
      new Request(`https://mail.example.com/api/linux-do-mail/inbox?q=${query}`),
    )

    expect(response.status).toBe(400)
    expect(mocks.listInbox).not.toHaveBeenCalled()
  })
})
