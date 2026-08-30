import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendReply } from './reply'
import type { Env, MessageRow, SessionUser } from '../../app/types'

const mocks = vi.hoisted(() => ({
  sendOutboundMessage: vi.fn(),
}))

vi.mock('../outbound/outbound-message', () => ({
  sendOutboundMessage: mocks.sendOutboundMessage,
}))

const user = {
  id: 'user-1',
  role: 'user',
  canReply: true,
} as SessionUser

const original = {
  id: 'message-1',
  mailbox_address: 'owner@example.com',
  direction: 'incoming',
  delivered_to: null,
  sender_address: 'sender@example.net',
  reply_to_json: '["support@example.org"]',
  subject: 'Question',
  references_header: null,
  message_id: '<message-1@example.net>',
} as MessageRow

beforeEach(() => {
  mocks.sendOutboundMessage.mockReset()
  mocks.sendOutboundMessage.mockResolvedValue(Response.json({ ok: true }))
})

describe('reply target', () => {
  it('uses the first valid Reply-To address and requires an active domain', async () => {
    const statements: string[] = []
    const database = {
      prepare(sql: string) {
        statements.push(sql)
        const statement = {
          bind() {
            return statement
          },
          first: async () => original,
        }
        return statement
      },
    }

    const response = await sendReply(
      {
        DB: database,
        RESEND_DOMAIN_CONFIGS: JSON.stringify({
          'example.com': { apiKey: 're_test' },
        }),
      } as unknown as Env,
      user,
      original.id,
      new Request('https://mail.example/api/messages/message-1/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Reply', idempotencyKey: 'request_12345678' }),
      }),
      '127.0.0.1',
    )

    expect(response.status).toBe(200)
    expect(statements[0]).toContain('FROM domains d')
    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(
      expect.anything(),
      user,
      expect.objectContaining({ recipients: ['support@example.org'] }),
      '127.0.0.1',
    )
  })

  it('passes validated multipart attachments to outbound storage', async () => {
    const statement = {
      bind() { return statement },
      first: async () => original,
    }
    const form = new FormData()
    form.set('text', 'Attached reply')
    form.set('idempotencyKey', 'request_attachment')
    form.append('attachments', new File(['report'], ' report\r\n.txt ', {
      type: 'text/plain',
    }))

    const response = await sendReply(
      {
        DB: { prepare: () => statement },
        RESEND_DOMAIN_CONFIGS: JSON.stringify({
          'example.com': { apiKey: 're_test' },
        }),
      } as unknown as Env,
      user,
      original.id,
      new Request('https://mail.example/api/messages/message-1/reply', {
        method: 'POST', body: form,
      }),
      '127.0.0.1',
    )

    expect(response.status).toBe(200)
    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(
      expect.anything(),
      user,
      expect.objectContaining({
        attachmentUploads: [expect.objectContaining({
          filename: 'report.txt', contentType: 'text/plain', size: 6,
        })],
        auditDetail: { originalId: original.id, attachmentCount: 1 },
      }),
      '127.0.0.1',
    )
  })
})
