import { describe, expect, it, vi } from 'vitest'
import { listMailNotifications } from './mail-notification-api'
import type { Env, SessionUser } from '../../app/types'

describe('mail notification index API', () => {
  it('returns only requested sources without exposing message bodies', async () => {
    const prepared: string[] = []
    const db = {
      prepare: vi.fn((sql: string) => {
        prepared.push(sql)
        return {
          bind() {
            return {
              all: async () => ({ results: sql.includes('ORDER BY message_date') ? [{
                source: 'icloud', account_id: 'icloud-1', message_id: '42',
                sender_name: 'Apple', sender_address: 'sender@example.net', unread_total: 1,
                subject: 'Verification code', message_date: 1_700_000_000, is_read: 0,
              }] : [{ source: 'icloud' }] }),
            }
          },
        }
      }),
    } as unknown as D1Database

    const response = await listMailNotifications(
      { DB: db } as Env,
      { id: 'user-1' } as SessionUser,
      new Request('https://mail.example.com/api/mail-notifications?sources=icloud&limit=20'),
    )
    const body = await response.json() as Record<string, unknown>

    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(prepared[0]).toContain('icloud_imap_messages')
    expect(prepared[0]).not.toContain('linux_do_mail_messages')
    expect(body).toEqual({
      messages: [{
        source: 'icloud', accountId: 'icloud-1', messageId: '42',
        senderName: 'Apple', senderAddress: 'sender@example.net',
        subject: 'Verification code', date: 1_700_000_000, isRead: false,
      }],
      sources: ['icloud'],
      unread: 1,
    })
    expect(JSON.stringify(body)).not.toContain('body')
    expect(JSON.stringify(body)).not.toContain('attachment')
  })

  it('does not broaden an unknown explicit source filter', async () => {
    const db = { prepare: vi.fn() } as unknown as D1Database
    const response = await listMailNotifications(
      { DB: db } as Env,
      { id: 'user-1' } as SessionUser,
      new Request('https://mail.example.com/api/mail-notifications?sources=unknown'),
    )

    await expect(response.json()).resolves.toEqual({ messages: [], sources: [], unread: 0 })
    expect(db.prepare).not.toHaveBeenCalled()
  })
})
