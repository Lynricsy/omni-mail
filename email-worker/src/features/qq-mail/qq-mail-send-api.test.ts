import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendQqMailMessage } from './qq-mail-send-api'
import type { Env, SessionUser } from '../../app/types'

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => Response.json({ message: { id: 'message-1', status: 'processing' } }, {
    status: 202,
  })),
}))

vi.mock('../outbound/outbound-message', () => ({ sendOutboundMessage: mocks.send }))
vi.mock('./qq-mail-credentials', () => ({ qqMailImapEnabled: () => true }))
vi.mock('./qq-mail-store', () => {
  class QqMailStoreError extends Error {
    constructor(readonly status: number, message: string) { super(message) }
  }
  return {
    QqMailStoreError,
    QqMailAccountStore: class {
      async get() {
        return {
          id: 'qq-1', userId: 'user-1', name: 'QQ', email: '123456789@qq.com',
          authorizationCode: 'authorization-code', status: 'active',
      identities: [
            { id: 'identity-primary', accountId: 'qq-1', email: '123456789@qq.com',
              isPrimary: true, createdAt: 1, updatedAt: 1 },
            { id: 'identity-foxmail', accountId: 'qq-1', email: 'work@foxmail.com',
              isPrimary: false, createdAt: 2, updatedAt: 2 },
          ],
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

function request(body: unknown) {
  return new Request('https://mail.example.com/api/qq-mail/accounts/qq-1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function environment(reply: Record<string, string> | null = null): Env {
  return {
    QQ_MAIL_CREDENTIALS_KEY: 'test-key-that-is-longer-than-thirty-two-characters',
    DB: {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => sql.includes('FROM qq_mail_messages') ? reply : { found: 1 },
        }),
      }),
    },
  } as unknown as Env
}

describe('QQ Mail sending API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('queues a single-recipient message from the connected account', async () => {
    const env = environment()
    const response = await sendQqMailMessage(env, user, 'qq-1', request({
      to: 'recipient@example.com', subject: 'Hello', text: 'Message body',
      idempotencyKey: 'request_12345678',
    }), '192.0.2.1')

    expect(response.status).toBe(202)
    expect(mocks.send).toHaveBeenCalledWith(env, user, expect.objectContaining({
      mailboxAddress: '123456789@qq.com', recipients: ['recipient@example.com'],
      rateLimitMaximums: { dayLimit: 50 }, auditAction: 'qq_mail.message.send',
      auditDetail: expect.objectContaining({
        accountName: 'QQ', sender: '12***@qq.com', recipient: 're***@example.com',
        recipientCount: 1, reply: false,
      }),
    }), '192.0.2.1')
  })

  it('derives reply recipient, subject, and threading headers on the server', async () => {
    const env = environment({
      sender_address: 'sender@example.com', subject: 'Original',
      message_id_header: '<original@example.com>',
    })
    const response = await sendQqMailMessage(env, user, 'qq-1', request({
      to: 'attacker@example.com', subject: 'Fake', text: 'Reply body',
      idempotencyKey: 'request_12345678', replyToMessageId: 'qq-message-1',
    }), '192.0.2.1')

    expect(response.status).toBe(202)
    expect(mocks.send).toHaveBeenCalledWith(env, user, expect.objectContaining({
      recipients: ['sender@example.com'], subject: 'Re: Original',
      inReplyTo: '<original@example.com>', references: '<original@example.com>',
    }), '192.0.2.1')
  })

  it('queues mail from a verified sender identity', async () => {
    const env = environment()
    const response = await sendQqMailMessage(env, user, 'qq-1', request({
      sender: 'work@foxmail.com', to: 'recipient@example.com', subject: 'Alias',
      text: 'Message body', idempotencyKey: 'request_alias_123',
    }), '192.0.2.1')

    expect(response.status).toBe(202)
    expect(mocks.send).toHaveBeenCalledWith(env, user, expect.objectContaining({
      mailboxAddress: 'work@foxmail.com',
    }), '192.0.2.1')
  })

  it('masks every address in a multi-recipient audit detail', async () => {
    const env = environment()
    const response = await sendQqMailMessage(env, user, 'qq-1', request({
      to: 'first@example.com, second@example.net', subject: 'Group', text: 'Message body',
      idempotencyKey: 'request_group_123',
    }), '192.0.2.1')

    expect(response.status).toBe(202)
    expect(mocks.send).toHaveBeenCalledWith(env, user, expect.objectContaining({
      auditDetail: expect.objectContaining({
        recipient: 'fi***@example.com, se***@example.net', recipientCount: 2,
      }),
    }), '192.0.2.1')
  })

  it('rejects a sender that is not a verified identity', async () => {
    const response = await sendQqMailMessage(environment(), user, 'qq-1', request({
      sender: 'attacker@qq.com', to: 'recipient@example.com', subject: 'Fake',
      text: 'Message body', idempotencyKey: 'request_fake_123',
    }), '192.0.2.1')

    expect(response.status).toBe(400)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('respects the existing account send permission', async () => {
    const response = await sendQqMailMessage(environment(), { ...user, canReply: false },
      'qq-1', request({ to: 'recipient@example.com', subject: 'Hello', text: 'Body',
        idempotencyKey: 'request_12345678' }), '192.0.2.1')

    expect(response.status).toBe(403)
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
