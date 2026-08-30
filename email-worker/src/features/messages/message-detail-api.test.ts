import { describe, expect, it, vi } from 'vitest'
import { getMessageAttachment, getMessageDetail, previewMessageAttachment } from './message-detail-api'
import type { AttachmentRow, Env, MessageRow, SessionUser } from '../../app/types'

const user = {
  id: 'user-1',
} as SessionUser

const message = {
  id: 'message-1',
  mailbox_address: 'inbox@example.com',
  direction: 'incoming',
  status: 'ready',
  folder: 'inbox',
  message_id: '<long-message-id@example.com>',
  in_reply_to: null,
  references_header: null,
  sender_name: 'Sender',
  sender_address: 'sender@example.net',
  delivered_to: null,
  recipients_json: '["inbox@example.com"]',
  cc_json: '[]',
  subject: 'Test message',
  preview: 'Preview',
  received_at: 100,
  sent_at: null,
  raw_key: 'raw/message-1.eml',
  body_key: null,
  size: 1024,
  quota_bytes: 1024,
  attachment_count: 0,
  has_html: 0,
  is_read: 0,
  is_starred: 0,
  trashed_at: null,
  purge_after: null,
  processing_error: null,
  processing_attempts: 0,
  last_failed_at: null,
  client_request_id: null,
  provider_id: null,
  delivery_status: null,
  provider_event_at: null,
  created_at: 100,
  updated_at: 100,
} satisfies MessageRow

const attachment = {
  id: 'attachment-1',
  message_id: message.id,
  filename: '七月-plan.pdf',
  content_type: 'application/pdf',
  size: 8,
  r2_key: 'attachments/attachment-1',
  content_id: null,
  disposition: 'attachment',
} satisfies AttachmentRow

function attachmentEnv(row: AttachmentRow | null, body = '%PDF-1.4') {
  const get = vi.fn(async () => ({
    body: new Response(body).body,
  }) as unknown as R2ObjectBody)
  const db = {
    prepare() {
      const statement = {
        bind: () => statement,
        first: async () => row,
      }
      return statement
    },
  }
  return {
    env: { DB: db, MAIL_BUCKET: { get } } as unknown as Env,
    get,
  }
}

describe('message details', () => {
  it('returns the message when the optional thread lookup fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const db = {
      prepare(sql: string) {
        const statement = {
          bind: () => statement,
          first: async () => message,
          all: async () => {
            if (sql.includes('FROM attachments')) return { results: [] }
            throw new Error('LIKE or GLOB pattern too complex')
          },
        }
        return statement
      },
    }

    const response = await getMessageDetail(
      { DB: db } as unknown as Env,
      user,
      message.id,
    )
    const result = await response.json() as {
      message: { id: string }
      thread: Array<{ id: string }>
    }

    expect(response.status).toBe(200)
    expect(result.message.id).toBe(message.id)
    expect(result.thread).toEqual([expect.objectContaining({ id: message.id })])
    expect(log).toHaveBeenCalledWith(
      'Unable to load message thread',
      { messageId: message.id },
      expect.any(Error),
    )
    log.mockRestore()
  })
})

describe('message attachments', () => {
  it('streams allowlisted PDFs inline with same-origin framing protection', async () => {
    const { env } = attachmentEnv({
      ...attachment,
      content_type: 'Application/PDF; charset=binary',
    })

    const response = await previewMessageAttachment(env, user, message.id, attachment.id)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toMatch(/^inline;/)
    expect(response.headers.get('Content-Disposition')).toContain(
      "filename*=UTF-8''%E4%B8%83%E6%9C%88-plan.pdf",
    )
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'")
    expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await response.text()).toBe('%PDF-1.4')
  })

  it('rejects active attachment types before reading R2', async () => {
    const { env, get } = attachmentEnv({
      ...attachment,
      filename: 'active.svg',
      content_type: 'image/svg+xml',
    })

    const response = await previewMessageAttachment(env, user, message.id, attachment.id)

    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({ error: '此附件类型不支持预览。' })
    expect(get).not.toHaveBeenCalled()
  })

  it('keeps the original attachment response as a download', async () => {
    const { env } = attachmentEnv(attachment)

    const response = await getMessageAttachment(env, user, message.id, attachment.id)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toMatch(/^attachment;/)
  })
})
