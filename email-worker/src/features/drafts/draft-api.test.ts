import { describe, expect, it, vi } from 'vitest'
import {
  attachmentFilesError,
  MAX_ATTACHMENT_BYTES,
  normalizeAttachmentFilename,
} from '../../shared/mail/attachment-policy'
import {
  pruneDraftsForLimits,
  sendDraft,
  uploadDraftAttachment,
  validateDraftInput,
} from './draft-api'
import type { Env, SessionUser } from '../../app/types'

describe('mail draft validation', () => {
  it('allows an incomplete draft while normalizing addresses', () => {
    expect(validateDraftInput({
      mailboxAddress: ' Owner@Example.COM ',
      to: '',
      subject: ' Partial ',
      text: ' Body ',
    })).toEqual({
      value: {
        mailboxAddress: 'owner@example.com',
        to: '',
        subject: 'Partial',
        text: 'Body',
      },
    })
  })

  it('keeps partial recipients but rejects header injection', () => {
    expect(validateDraftInput({
      mailboxAddress: 'owner@example.com',
      to: 'friend@',
      subject: 'Hello',
      text: '',
    })).toMatchObject({ value: { to: 'friend@' } })
    expect(validateDraftInput({
      mailboxAddress: 'owner@example.com',
      to: 'friend@example.com\r\nBcc: hidden@example.com',
      subject: 'Hello\r\nBcc: hidden@example.com',
      text: '',
    })).toEqual({ error: '草稿收件人内容过长或包含换行。' })
  })

  it('stores multiple draft recipients in the existing text field', () => {
    expect(validateDraftInput({
      mailboxAddress: 'owner@example.com',
      to: ' First@Example.com, SECOND@example.net ',
      subject: 'Hello',
      text: '',
    })).toMatchObject({
      value: { to: 'first@example.com, second@example.net' },
    })
  })

  it('sanitizes attachment names and exposes the upload limit', () => {
    expect(normalizeAttachmentFilename(' report\r\n.pdf ')).toBe('report.pdf')
    expect(MAX_ATTACHMENT_BYTES).toBe(5 * 1024 * 1024)
  })

  it('rejects invalid attachment batches before storing them', () => {
    expect(attachmentFilesError(Array.from({ length: 6 }, () => ({ size: 1 }))))
      .toBe('一封邮件最多添加 5 个附件。')
    expect(attachmentFilesError([{ size: 5 * 1024 * 1024 + 1 }]))
      .toBe('单个附件不能超过 5 MiB。')
    expect(attachmentFilesError([{ size: 0 }])).toBe('请选择要上传的附件。')
  })

  it('removes a staged upload when a concurrent request reaches the attachment limit', async () => {
    const remove = vi.fn(async () => undefined)
    const prepare = (sql: string) => ({
      bind() { return this },
      first: async () => {
        if (sql.includes('FROM mail_drafts WHERE')) return {
          id: 'draft-1', user_id: 'user-1', mailbox_address: 'owner@example.com',
          recipient_address: '', subject: '', body_text: '', created_at: 1, updated_at: 1,
        }
        if (sql.includes('COUNT(*) AS count')) return { count: 4, bytes: 1 }
        return null
      },
      run: async () => ({ meta: { changes: 1 } }),
    })
    const env = {
      DB: {
        prepare,
        batch: async () => [
          { meta: { changes: 0 } },
          { meta: { changes: 0 } },
        ],
      },
      MAIL_BUCKET: { put: vi.fn(async () => undefined), delete: remove },
    } as unknown as Env
    const form = new FormData()
    form.set('file', new File(['report'], 'report.txt', { type: 'text/plain' }))
    const response = await uploadDraftAttachment(
      env,
      { id: 'user-1', role: 'user', canReply: true } as SessionUser,
      'draft-1',
      new Request('https://mail.example/api/drafts/draft-1/attachments', {
        method: 'POST', body: form,
      }),
    )

    expect(response.status).toBe(409)
    expect(remove).toHaveBeenCalledOnce()
  })

  it('requeues a failed idempotent draft send after the draft was transferred', async () => {
    const send = vi.fn(async () => undefined)
    const existing = {
      id: 'out-1',
      status: 'failed',
      provider_id: null,
      body_key: 'bodies/out-1.json',
      mailbox_address: 'owner@example.com',
    }
    const statement = {
      bind: vi.fn(function bind() { return this }),
      first: vi.fn(async () => existing),
      run: vi.fn(async () => ({ meta: { changes: 1 } })),
    }
    const env = {
      DB: { prepare: vi.fn(() => statement) },
      MAIL_QUEUE: { send },
      RESEND_DOMAIN_CONFIGS: JSON.stringify({
        'example.com': { apiKey: 're_test' },
      }),
    } as unknown as Env
    const user = {
      id: 'user-1',
      role: 'user',
      canReply: true,
    } as SessionUser
    const response = await sendDraft(
      env,
      user,
      'draft-1',
      new Request('https://mail.example/api/drafts/draft-1/send', {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: 'request_retry' }),
      }),
      '127.0.0.1',
    )

    expect(response.status).toBe(202)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'outbound',
      messageId: 'out-1',
      userId: 'user-1',
    }))
  })

  it('rejects a SendFlare-only draft attachment before queueing it', async () => {
    const prepare = (sql: string) => ({
      bind() { return this },
      first: async () => {
        if (sql.includes('FROM messages m')) return null
        if (sql.includes('FROM mail_drafts WHERE')) return {
          id: 'draft-1', user_id: 'user-1', mailbox_address: 'owner@example.com',
          recipient_address: 'friend@example.net', subject: 'Files', body_text: 'Attached',
          created_at: 1, updated_at: 1,
        }
        if (sql.includes('SELECT 1 AS available')) return { available: 1 }
        return null
      },
      all: async () => ({
        results: sql.includes('FROM mail_draft_attachments') ? [{
          id: 'attachment-1', draft_id: 'draft-1', filename: 'report.pdf',
          content_type: 'application/pdf', size: 100, r2_key: 'drafts/report.pdf',
          created_at: 1,
        }] : [],
      }),
    })
    const response = await sendDraft(
      {
        DB: { prepare },
        SENDFLARE_API_KEY: 'sf_test',
      } as unknown as Env,
      { id: 'user-1', role: 'user', canReply: true } as SessionUser,
      'draft-1',
      new Request('https://mail.example/api/drafts/draft-1/send', {
        method: 'POST', body: JSON.stringify({ idempotencyKey: 'request_attachments' }),
      }),
      '127.0.0.1',
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'SendFlare 暂不支持附件，请为该域名配置 Resend 后重试。',
    })
  })

  it('prunes excess drafts in bounded database batches', async () => {
    const excess = Array.from({ length: 205 }, (_, index) => ({ id: `draft-${index}` }))
    const deleteBatchSizes: number[] = []
    const database = {
      prepare(sql: string) {
        let bindings: unknown[] = []
        return {
          bind(...values: unknown[]) { bindings = values; return this },
          async all() {
            if (sql.includes('ROW_NUMBER()')) return { results: excess }
            if (sql.includes('FROM mail_draft_attachments')) return { results: [] }
            return { results: [] }
          },
          sql,
          get bindings() { return bindings },
        }
      },
      async batch(statements: Array<{ sql: string; bindings: unknown[] }>) {
        const deletion = statements.find((statement) => statement.sql.includes('DELETE FROM mail_drafts'))
        if (deletion) deleteBatchSizes.push(deletion.bindings.length)
        return []
      },
    }
    const env = {
      DB: database,
      MAIL_BUCKET: { delete: vi.fn(async () => undefined) },
    } as unknown as Env

    await pruneDraftsForLimits(env, {
      superAdmin: 8,
      admin: 7,
      user: 5,
      temporary: 3,
    })

    expect(deleteBatchSizes).toEqual([100, 100, 5])
  })
})
