import { describe, expect, it, vi } from 'vitest'
import {
  getAdminMessageDetail,
  listAdminMessages,
  manageAdminMessages,
} from './admin-message-api'
import type { Env, MessageRow, SessionUser } from '../../../app/types'

const superAdmin: SessionUser = {
  id: 'super-1',
  email: 'owner@example.com',
  displayName: 'Owner',
  role: 'super_admin',
  mailboxLimit: 100,
  storageQuotaBytes: 0,
  storageUsedBytes: 0,
  canCreateMailboxes: true,
  canReply: true,
  canTranslate: true,
  temporaryExpiresAt: null,
}

const message = {
  id: 'message-1',
  mailbox_address: 'person@example.com',
  direction: 'incoming',
  status: 'ready',
  folder: 'trash',
  message_id: '<message-1@example.net>',
  in_reply_to: null,
  references_header: null,
  sender_name: 'Sender',
  sender_address: 'sender@example.net',
  delivered_to: null,
  recipients_json: '["person@example.com"]',
  cc_json: '[]',
  reply_to_json: '[]',
  subject: 'Subject',
  preview: 'Preview',
  received_at: 100,
  sent_at: null,
  raw_key: 'raw/message-1.eml',
  body_key: null,
  size: 10,
  quota_bytes: 10,
  stored_bytes: 10,
  attachment_count: 0,
  has_html: 0,
  is_read: 0,
  is_starred: 0,
  trashed_at: 90,
  purge_after: 200,
  processing_error: null,
  processing_attempts: 0,
  last_failed_at: null,
  client_request_id: null,
  provider_id: null,
  delivery_status: null,
  provider_event_at: null,
  created_at: 100,
  updated_at: 100,
  owner_user_id: 'user-2',
  owner_email: 'person@example.com',
  owner_name: 'Person',
} satisfies MessageRow & {
  owner_user_id: string
  owner_email: string
  owner_name: string
}

describe('administrator message access', () => {
  it('rejects ordinary administrators before querying D1', async () => {
    const prepare = vi.fn()
    const response = await listAdminMessages(
      { DB: { prepare } } as unknown as Env,
      { ...superAdmin, role: 'admin' },
      new Request('https://mail.example.com/api/admin/messages'),
    )

    expect(response.status).toBe(403)
    expect(prepare).not.toHaveBeenCalled()
  })

  it('queries across owners with bound filters and cursor pagination', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const db = {
      prepare(sql: string) {
        const entry = { sql, bindings: [] as unknown[] }
        statements.push(entry)
        const statement = {
          sql,
          bind(...bindings: unknown[]) {
            entry.bindings = bindings
            return statement
          },
          all: async () => ({ results: [] }),
        }
        return statement
      },
    }
    const response = await listAdminMessages(
      { DB: db } as unknown as Env,
      superAdmin,
      new Request('https://mail.example.com/api/admin/messages?q=invoice&user=person%40example.com&direction=incoming'),
    )

    expect(response.status).toBe(200)
    expect(statements[0]?.sql).toContain('JOIN users u ON u.id = mb.user_id')
    expect(statements[0]?.sql).not.toContain('mb.user_id = ?')
    expect(statements[0]?.bindings).toContain('%person@example.com%')
    expect(statements[0]?.bindings.at(-1)).toBe(31)
  })

  it('returns another user message without changing its read state and audits the view', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const db = {
      prepare(sql: string) {
        const entry = { sql, bindings: [] as unknown[] }
        statements.push(entry)
        const statement = {
          sql,
          bind(...bindings: unknown[]) {
            entry.bindings = bindings
            return statement
          },
          first: async () => message,
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 1 } }),
        }
        return statement
      },
    }
    const response = await getAdminMessageDetail(
      { DB: db, MAIL_BUCKET: {} } as unknown as Env,
      superAdmin,
      message.id,
      '127.0.0.1',
    )
    const result = await response.json() as {
      message: { id: string; isRead: boolean; owner: { id: string } }
    }

    expect(response.status).toBe(200)
    expect(result.message).toMatchObject({
      id: message.id,
      isRead: false,
      owner: { id: message.owner_user_id },
    })
    expect(statements.some(({ sql }) => /UPDATE messages.+is_read/s.test(sql))).toBe(false)
    expect(statements.some(({ bindings }) => bindings.includes('message.admin_view'))).toBe(true)
  })
})

describe('administrator message management', () => {
  it('permanently deletes trash using the actual owner for quota release', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const batched: Array<{ sql: string; bindings: unknown[] }> = []
    const db = {
      prepare(sql: string) {
        const entry = { sql, bindings: [] as unknown[] }
        statements.push(entry)
        const statement = {
          sql,
          bind(...bindings: unknown[]) {
            entry.bindings = bindings
            return statement
          },
          all: async () => ({
            results: sql.includes('FROM messages m') ? [message] : [],
          }),
          run: async () => ({ meta: { changes: 1 } }),
        }
        return statement
      },
      batch: async (batch: Array<{ sql?: string }>) => {
        const entries = batch.map((statement) => statements.find((entry) => (
          entry.sql === statement.sql
        ))).filter((entry): entry is { sql: string; bindings: unknown[] } => Boolean(entry))
        batched.push(...entries)
        return entries.map(() => ({ meta: { changes: 1 } }))
      },
    }
    const remove = vi.fn(async () => undefined)
    const response = await manageAdminMessages(
      { DB: db, MAIL_BUCKET: { delete: remove } } as unknown as Env,
      superAdmin,
      new Request('https://mail.example.com/api/admin/messages/bulk', {
        method: 'PATCH',
        body: JSON.stringify({ ids: [message.id], action: 'delete' }),
      }),
      '127.0.0.1',
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ updatedCount: 1 })
    expect(remove).toHaveBeenCalledWith([message.raw_key])
    expect(batched.find(({ sql }) => sql.includes('UPDATE users'))?.bindings)
      .toEqual([message.quota_bytes, message.owner_user_id, message.id, message.owner_user_id])
    expect(statements.some(({ bindings }) => bindings.includes('message.admin_delete'))).toBe(true)
  })
})
