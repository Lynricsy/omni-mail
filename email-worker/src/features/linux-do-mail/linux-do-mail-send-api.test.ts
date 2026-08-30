import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendLinuxDoMailMessage } from './linux-do-mail-api'
import type { Env, SessionUser } from '../../app/types'

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => Response.json({ message: { id: 'message-1', status: 'processing' } }, {
    status: 202,
  })),
}))

vi.mock('../outbound/outbound-message', () => ({ sendOutboundMessage: mocks.send }))
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
    },
  }
})

const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: true, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

const env = {
  LINUX_DO_MAIL_CREDENTIALS_KEY: 'test-key-that-is-longer-than-thirty-two-characters',
  DB: {
    prepare: () => ({ bind: () => ({ first: async () => ({ found: 1 }) }) }),
  },
} as unknown as Env

function request(body: unknown): Request {
  return new Request('https://mail.example.com/api/linux-do-mail/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Linux DO Mail sending API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('queues mail with the connected sender and the provider daily cap', async () => {
    const response = await sendLinuxDoMailMessage(env, user, request({
      to: 'recipient@example.com', subject: 'Hello', text: 'Message body',
      idempotencyKey: 'request_12345678',
    }), '192.0.2.1')

    expect(response.status).toBe(202)
    expect(mocks.send).toHaveBeenCalledWith(env, user, expect.objectContaining({
      mailboxAddress: 'member@linux.do',
      recipients: ['recipient@example.com'],
      rateLimitMaximums: { dayLimit: 50 },
      auditAction: 'linuxdo_mail.message.send',
    }), '192.0.2.1')
  })

  it('rejects header injection before queueing', async () => {
    const response = await sendLinuxDoMailMessage(env, user, request({
      to: 'recipient@example.com', subject: 'Hello\r\nBcc: attacker@example.com',
      text: 'Message body', idempotencyKey: 'request_12345678',
    }), '192.0.2.1')

    expect(response.status).toBe(400)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('respects the existing account send permission', async () => {
    const response = await sendLinuxDoMailMessage(env, {
      ...user, canReply: false,
    }, request({
      to: 'recipient@example.com', subject: 'Hello', text: 'Message body',
      idempotencyKey: 'request_12345678',
    }), '192.0.2.1')

    expect(response.status).toBe(403)
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
