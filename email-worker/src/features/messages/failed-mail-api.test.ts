import { describe, expect, it, vi } from 'vitest'
import { failedMessageSummary, retryFailedMessage } from './failed-mail-api'
import { DELIVERY_UNCERTAIN_PREFIX } from '../outbound/outbound-message'
import type { Env, SessionUser } from '../../app/types'

const administrator: SessionUser = {
  id: 'admin-1',
  email: 'owner@example.com',
  displayName: 'Owner',
  role: 'super_admin',
  mailboxLimit: 100,
  storageQuotaBytes: 5 * 1024 ** 3,
  storageUsedBytes: 0,
  canCreateMailboxes: true,
  canReply: true,
  temporaryExpiresAt: null,
}

describe('failed mail summaries', () => {
  it('does not expose private R2 keys to administrators', () => {
    const summary = failedMessageSummary({
      id: 'message-1',
      mailbox_address: 'inbox@example.com',
      sender_name: 'Sender',
      sender_address: 'sender@example.net',
      subject: 'Broken message',
      processing_error: 'MIME parse failed',
      processing_attempts: 3,
      last_failed_at: 100,
      updated_at: 101,
      size: 2048,
      raw_key: 'raw/private.eml',
      body_key: null,
    })
    expect(summary.canRetry).toBe(true)
    expect(summary).not.toHaveProperty('rawKey')
  })

  it('does not offer an automatic retry when delivery is uncertain', () => {
    expect(failedMessageSummary({
      id: 'message-1', mailbox_address: 'out@example.com', sender_name: null,
      sender_address: 'out@example.com', subject: 'Maybe sent',
      processing_error: `${DELIVERY_UNCERTAIN_PREFIX}timeout`, processing_attempts: 1,
      last_failed_at: 100, updated_at: 100, size: 10,
      raw_key: null, body_key: 'bodies/message-1.json',
    }).canRetry).toBe(false)
  })

  it('checks the raw message, queues the retry, and writes an audit entry', async () => {
    const queue = vi.fn(async () => undefined)
    const head = vi.fn(async () => ({ size: 2048 }))
    const statements: string[] = []
    const db = {
      prepare(sql: string) {
        statements.push(sql)
        const statement = {
          bind: () => statement,
          first: async () => sql.includes('SELECT m.id')
            ? {
                id: 'message-1',
                direction: 'incoming',
                raw_key: 'raw/message-1.eml',
                body_key: null,
                in_reply_to: null,
                recipients_json: '[]',
                user_id: 'user-1',
              }
            : null,
          run: async () => ({ success: true, meta: { changes: 1 } }),
        }
        return statement
      },
    }
    const env = {
      DB: db,
      MAIL_BUCKET: { head },
      MAIL_QUEUE: { send: queue },
    } as unknown as Env

    const response = await retryFailedMessage(
      env,
      administrator,
      'message-1',
      '127.0.0.1',
    )

    expect(response.status).toBe(200)
    expect(head).toHaveBeenCalledWith('raw/message-1.eml')
    expect(queue).toHaveBeenCalledWith({ kind: 'parse', messageId: 'message-1' })
    expect(statements.some((sql) => sql.includes('INSERT INTO audit_logs'))).toBe(true)
  })
})
