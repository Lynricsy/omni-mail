import { describe, expect, it, vi } from 'vitest'
import {
  canViewUnassignedMail,
  listMessages,
  messageSummary,
  parseSyncVersion,
} from './message-list-api'
import { searchLikePattern } from '../../shared/mail/message-search'
import type { Env, SessionUser } from '../../app/types'

const user: SessionUser = {
  id: 'user-1',
  email: 'owner@example.com',
  displayName: 'Owner',
  role: 'super_admin',
  mailboxLimit: 20,
  storageQuotaBytes: 1024,
  storageUsedBytes: 0,
  canCreateMailboxes: true,
  canReply: true,
  canTranslate: true,
  temporaryExpiresAt: null,
}

describe('message sync version', () => {
  it('accepts non-negative integer versions', () => {
    expect(parseSyncVersion(null)).toBeNull()
    expect(parseSyncVersion('0')).toBe(0)
    expect(parseSyncVersion('42')).toBe(42)
  })

  it('rejects malformed versions', () => {
    expect(parseSyncVersion('-1')).toBeUndefined()
    expect(parseSyncVersion('1.5')).toBeUndefined()
    expect(parseSyncVersion('latest')).toBeUndefined()
  })

  it('builds a literal full-text search pattern', () => {
    expect(searchLikePattern('invoice_50%')).toBe('%invoice\\_50\\%%')
  })

  it('shows the original recipient for unassigned mail', () => {
    const summary = messageSummary({
      id: 'message-1',
      mailbox_address: '__unassigned__@omnimail.invalid',
      delivered_to: 'unknown@example.com',
      direction: 'incoming',
      status: 'ready',
      folder: 'inbox',
      sender_name: null,
      sender_address: 'sender@example.net',
      recipients_json: '["unknown@example.com"]',
      subject: 'Hello',
      preview: 'Preview',
      received_at: 1,
      sent_at: null,
      attachment_count: 0,
      is_read: 0,
      is_starred: 0,
      processing_error: null,
      purge_after: null,
      created_at: 1,
    })

    expect(summary.mailboxAddress).toBe('unknown@example.com')
  })

  it('allows only the super administrator to view unassigned mail', () => {
    expect(canViewUnassignedMail(user)).toBe(true)
    expect(canViewUnassignedMail({ ...user, role: 'admin' })).toBe(false)
    expect(canViewUnassignedMail({ ...user, role: 'user' })).toBe(false)
  })

  it('batches the message page and folder counts in one D1 call', async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = []
    const batch = vi.fn(async () => [
      { results: [{
        id: 'message-1', mailbox_address: 'inbox@example.com',
        delivered_to: null, direction: 'incoming', status: 'ready', folder: 'inbox',
        sender_name: 'Sender', sender_address: 'sender@example.net',
        recipients_json: '["inbox@example.com"]', subject: 'Hello', preview: 'Preview',
        received_at: 10, sent_at: null, attachment_count: 0, is_read: 0,
        is_starred: 0, processing_error: null, delivery_status: null,
        purge_after: null, created_at: 10, sort_time: 10,
      }] },
      { results: [{ unread: 1, starred: 0, sent: 0, trash: 0, drafts: 2 }] },
    ])
    const db = {
      prepare: (sql: string) => {
        const statement = {
          sql,
          values: [] as unknown[],
          bind(...values: unknown[]) {
            this.values = values
            statements.push(this)
            return this
          },
          first: async () => ({ version: 3 }),
        }
        return statement
      },
      batch,
    }
    const response = await listMessages(
      { DB: db } as unknown as Env,
      user,
      new Request('https://mail.example.com/api/messages?folder=inbox'),
    )
    const result = await response.json() as {
      version: number
      messages: Array<{ id: string }>
      counts: { unread: number; drafts: number }
    }

    expect(batch).toHaveBeenCalledOnce()
    expect(batch.mock.calls[0][0]).toHaveLength(2)
    expect(statements.some((statement) => statement.sql.includes('ORDER BY m.sort_at'))).toBe(true)
    expect(statements.filter((statement) => statement.sql.includes('FROM messages'))
      .every((statement) => statement.sql.includes('mb.address = ?'))).toBe(true)
    expect(result).toMatchObject({
      version: 3,
      messages: [{ id: 'message-1' }],
      counts: { unread: 1, drafts: 2 },
    })
  })
})
