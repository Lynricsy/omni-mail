import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  arrayBufferToBase64,
  deliverOutboundMessage,
  sendOutboundMessage,
} from './outbound-message'
import type { Env, SessionUser } from './types'

const user: SessionUser = {
  id: 'user-1',
  email: 'owner@example.com',
  displayName: 'Owner',
  role: 'user',
  mailboxLimit: 1,
  storageQuotaBytes: 1024 ** 3,
  storageUsedBytes: 0,
  canCreateMailboxes: false,
  canReply: true,
  temporaryExpiresAt: null,
}

function environment(
  firstResult: unknown = null,
  attachmentRows: Array<{ filename: string; r2_key: string }> = [],
  rateLimit: {
    changes: number
    row?: Record<string, number>
  } = { changes: 1 },
) {
  const statements: Array<{ sql: string; bindings: unknown[] }> = []
  const put = vi.fn(async () => undefined)
  const send = vi.fn(async () => undefined)
  const prepare = (sql: string) => {
    const statement = {
      bindings: [] as unknown[],
      bind(...bindings: unknown[]) {
        this.bindings = bindings
        statements.push({ sql, bindings })
        return this
      },
      first: async () => (
        sql.includes('FROM outbound_rate_limits') ? rateLimit.row ?? null : firstResult
      ),
      all: async () => ({
        results: sql.includes('FROM attachments') ? attachmentRows : [],
      }),
      run: async () => ({
        meta: {
          changes: sql.includes('INSERT INTO outbound_rate_limits')
            ? rateLimit.changes
            : 1,
        },
      }),
    }
    return statement
  }
  return {
    env: {
      DB: { prepare, batch: async () => [] },
      MAIL_BUCKET: { put },
      MAIL_QUEUE: { send },
      RESEND_API_KEY: 're_test',
      RESEND_FROM: 'OmniMail <reply@example.com>',
    } as unknown as Env,
    put,
    send,
    statements,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('outbound delivery', () => {
  it('encodes binary attachment content for Resend', () => {
    expect(arrayBufferToBase64(new Uint8Array([0, 1, 2, 255]).buffer)).toBe('AAEC/w==')
  })

  it('stores and queues a new outgoing message before returning', async () => {
    const { env, put, send, statements } = environment()
    const response = await sendOutboundMessage(env, user, {
      mailboxAddress: 'owner@example.com',
      recipients: ['friend@example.net'],
      subject: 'Hello',
      text: 'Message body',
      idempotencyKey: 'request_12345678',
      auditAction: 'message.send',
      auditDetail: { recipient: 'friend@example.net' },
    }, '127.0.0.1')

    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ message: { status: 'processing' } })
    expect(put).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'outbound',
      userId: user.id,
      auditAction: 'message.send',
    }))
    expect(statements.some(({ sql }) => sql.includes('INSERT INTO outbound_rate_limits')))
      .toBe(true)
  })

  it('atomically transfers draft attachments into the outgoing message', async () => {
    const { env, statements } = environment()
    const response = await sendOutboundMessage(env, user, {
      mailboxAddress: 'owner@example.com',
      recipients: ['friend@example.net'],
      subject: 'Files',
      text: 'Attached',
      idempotencyKey: 'request_attachments',
      draftId: 'draft-1',
      attachments: [{
        id: 'attachment-1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        size: 100,
        r2Key: 'drafts/user-1/attachment-1',
      }],
      auditAction: 'message.send',
      auditDetail: { attachmentCount: 1 },
    }, '127.0.0.1')

    expect(response.status).toBe(202)
    expect(statements.some(({ sql }) => sql.includes('INSERT INTO attachments'))).toBe(true)
    expect(statements.some(({ sql }) => sql.includes('DELETE FROM mail_drafts'))).toBe(true)
    expect(statements.some(({ sql }) => sql.includes('attachment_count'))).toBe(true)
  })

  it('returns Retry-After without storing or queueing when the user is rate limited', async () => {
    const now = Math.floor(Date.now() / 1000)
    const minuteStartedAt = Math.floor(now / 60) * 60
    const { env, put, send } = environment(null, [], {
      changes: 0,
      row: {
        minute_started_at: minuteStartedAt,
        minute_count: 10,
        day_started_at: Math.floor(now / 86_400) * 86_400,
        day_count: 20,
      },
    })

    const response = await sendOutboundMessage(env, user, {
      mailboxAddress: 'owner@example.com',
      recipients: ['friend@example.net'],
      subject: 'Limited',
      text: 'Message body',
      idempotencyKey: 'request_limited',
      auditAction: 'message.send',
      auditDetail: { recipient: 'friend@example.net' },
    }, '127.0.0.1')

    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(put).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('requeues an idempotent send after its first queue attempt failed', async () => {
    const { env, send, statements } = environment({
      id: 'out-retry',
      status: 'failed',
      provider_id: null,
      body_key: 'bodies/out-retry.json',
    })
    const response = await sendOutboundMessage(env, user, {
      mailboxAddress: 'owner@example.com',
      recipients: ['friend@example.net'],
      subject: 'Retry',
      text: 'Message body',
      idempotencyKey: 'request_retry',
      auditAction: 'message.send',
      auditDetail: { recipient: 'friend@example.net' },
    }, '127.0.0.1')

    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({
      message: { id: 'out-retry', status: 'processing' },
    })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'outbound',
      messageId: 'out-retry',
    }))
    expect(statements.some(({ sql }) => sql.includes('outbound_rate_limits'))).toBe(false)
  })

  it('sends a queued message idempotently and records the provider id', async () => {
    const { env, statements } = environment({
      id: 'out-1',
      status: 'processing',
      mailbox_address: 'owner@example.com',
      sender_name: 'Owner',
      recipients_json: '["friend@example.net"]',
      subject: 'Hello',
      body_key: 'bodies/out-1.json',
      in_reply_to: null,
      references_header: null,
      client_request_id: 'request_12345678',
      domain_is_active: 1,
    })
    env.RESEND_DOMAIN_CONFIGS = JSON.stringify({
      'example.com': {
        apiKey: 're_example',
        from: 'Example Mail <mail@example.com>',
      },
    })
    env.MAIL_BUCKET.get = vi.fn(async () => new Response(JSON.stringify({
      text: 'Message body',
      html: '<p>Message body</p>',
    })) as unknown as R2ObjectBody)
    const resend = vi.fn(async () => Response.json({ id: 'resend-1' }))
    vi.stubGlobal('fetch', resend)

    await deliverOutboundMessage(env, {
      kind: 'outbound',
      messageId: 'out-1',
      userId: user.id,
      ip: '127.0.0.1',
      auditAction: 'message.send',
      auditDetail: { recipient: 'friend@example.net' },
    })

    expect(resend).toHaveBeenCalledOnce()
    const [url, request] = resend.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(request?.headers).toMatchObject({
      Authorization: 'Bearer re_example',
      'Idempotency-Key': 'omnimail-request_12345678',
      'User-Agent': 'OmniMail/0.1',
    })
    expect(JSON.parse(String(request?.body))).toMatchObject({
      from: 'Example Mail <mail@example.com>',
      reply_to: 'owner@example.com',
    })
    expect(statements.some(({ sql, bindings }) => (
      sql.includes("SET status = 'sent'") && bindings.includes('resend-1')
    ))).toBe(true)
    expect(statements.some(({ sql, bindings }) => (
      sql.includes('INSERT INTO audit_logs') && bindings.includes('message.send')
    ))).toBe(true)
  })

  it('sends a queued message through a domain-specific SendFlare account', async () => {
    const { env, statements } = environment({
      id: 'out-sendflare', status: 'processing', mailbox_address: 'owner@example.com',
      sender_name: 'Owner', recipients_json: '["friend@example.net"]', subject: 'Hello',
      body_key: 'bodies/out-sendflare.json', in_reply_to: null, references_header: null,
      client_request_id: 'request_sendflare', domain_is_active: 1,
    })
    env.SENDFLARE_DOMAIN_CONFIGS = JSON.stringify({
      'example.com': { apiKey: 'sf_example', from: 'mail@example.com' },
    })
    env.MAIL_BUCKET.get = vi.fn(async () => new Response(JSON.stringify({
      text: 'Message body', html: '<p>Message body</p>',
    })) as unknown as R2ObjectBody)
    const sendflare = vi.fn(async () => Response.json({
      success: true, data: { emailId: 'sendflare-1' },
    }))
    vi.stubGlobal('fetch', sendflare)

    await deliverOutboundMessage(env, {
      kind: 'outbound', messageId: 'out-sendflare', userId: user.id, ip: '127.0.0.1',
      auditAction: 'message.send', auditDetail: { recipient: 'friend@example.net' },
    })

    const [url, request] = sendflare.mock.calls[0]
    expect(url).toBe('https://api.sendflare.com/v1/send')
    expect(request?.headers).toMatchObject({
      Authorization: 'Bearer sf_example',
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'OmniMail/0.1',
    })
    expect(JSON.parse(String(request?.body))).toEqual({
      from: 'mail@example.com', to: 'friend@example.net', subject: 'Hello',
      body: '<p>Message body</p>', replyTo: ['owner@example.com'],
    })
    expect(statements.some(({ sql, bindings }) => (
      sql.includes("SET status = 'sent'") && bindings.includes('sendflare:sendflare-1')
    ))).toBe(true)
    expect(statements.some(({ sql }) => sql.includes('resend_webhook_events'))).toBe(false)
  })

  it('does not deliver a queued message after its domain is disabled', async () => {
    const { env } = environment({
      id: 'out-1',
      status: 'processing',
      mailbox_address: 'owner@example.com',
      sender_name: 'Owner',
      recipients_json: '["friend@example.net"]',
      subject: 'Hello',
      body_key: 'bodies/out-1.json',
      in_reply_to: null,
      references_header: null,
      client_request_id: 'request_12345678',
      domain_is_active: 0,
    })
    const resend = vi.fn()
    vi.stubGlobal('fetch', resend)

    await expect(deliverOutboundMessage(env, {
      kind: 'outbound',
      messageId: 'out-1',
      userId: user.id,
      ip: '127.0.0.1',
      auditAction: 'message.send',
      auditDetail: { recipient: 'friend@example.net' },
    })).rejects.toMatchObject({
      message: 'Outbound mailbox domain is disabled',
      retryable: false,
    })
    expect(resend).not.toHaveBeenCalled()
  })

  it('includes stored attachments in the Resend payload', async () => {
    const { env } = environment({
      id: 'out-1',
      status: 'processing',
      mailbox_address: 'owner@example.com',
      sender_name: 'Owner',
      recipients_json: '["friend@example.net"]',
      subject: 'Files',
      body_key: 'bodies/out-1.json',
      in_reply_to: null,
      references_header: null,
      client_request_id: 'request_attachments',
      domain_is_active: 1,
    }, [{ filename: 'report.bin', r2_key: 'drafts/user-1/attachment-1' }])
    env.MAIL_BUCKET.get = vi.fn(async (key: string) => (
      key === 'bodies/out-1.json'
        ? new Response(JSON.stringify({ text: 'Attached', html: '<p>Attached</p>' }))
        : new Response(new Uint8Array([0, 1, 2, 255]))
    )) as typeof env.MAIL_BUCKET.get
    const resend = vi.fn(async () => Response.json({ id: 'resend-attachment' }))
    vi.stubGlobal('fetch', resend)

    await deliverOutboundMessage(env, {
      kind: 'outbound',
      messageId: 'out-1',
      userId: user.id,
      ip: '127.0.0.1',
      auditAction: 'message.send',
      auditDetail: { attachmentCount: 1 },
    })

    const payload = JSON.parse(String(resend.mock.calls[0][1]?.body)) as {
      attachments: Array<{ filename: string; content: string }>
    }
    expect(payload.attachments).toEqual([{
      filename: 'report.bin',
      content: 'AAEC/w==',
    }])
  })

  it('falls back to Resend instead of dropping attachments for a SendFlare domain', async () => {
    const { env } = environment({
      id: 'out-attachment-fallback', status: 'processing', mailbox_address: 'owner@example.com',
      sender_name: 'Owner', recipients_json: '["friend@example.net"]', subject: 'Files',
      body_key: 'bodies/out-attachment-fallback.json', in_reply_to: null,
      references_header: null, client_request_id: 'request_fallback', domain_is_active: 1,
    }, [{ filename: 'report.bin', r2_key: 'attachments/report.bin' }])
    env.SENDFLARE_DOMAIN_CONFIGS = JSON.stringify({
      'example.com': { apiKey: 'sf_example' },
    })
    env.MAIL_BUCKET.get = vi.fn(async (key: string) => (
      key === 'bodies/out-attachment-fallback.json'
        ? new Response(JSON.stringify({ text: 'Attached', html: '<p>Attached</p>' }))
        : new Response(new Uint8Array([1, 2, 3]))
    )) as typeof env.MAIL_BUCKET.get
    const provider = vi.fn(async () => Response.json({ id: 'resend-fallback' }))
    vi.stubGlobal('fetch', provider)

    await deliverOutboundMessage(env, {
      kind: 'outbound', messageId: 'out-attachment-fallback', userId: user.id,
      ip: '127.0.0.1', auditAction: 'message.send', auditDetail: { attachmentCount: 1 },
    })

    expect(provider.mock.calls[0][0]).toBe('https://api.resend.com/emails')
    expect(JSON.parse(String(provider.mock.calls[0][1]?.body)).attachments).toEqual([{
      filename: 'report.bin', content: 'AQID',
    }])
  })

  it('fails explicitly when SendFlare cannot deliver an attachment', async () => {
    const { env } = environment({
      id: 'out-sendflare-attachment', status: 'processing', mailbox_address: 'owner@example.com',
      sender_name: 'Owner', recipients_json: '["friend@example.net"]', subject: 'Files',
      body_key: 'bodies/out-sendflare-attachment.json', in_reply_to: null,
      references_header: null, client_request_id: 'request_no_fallback', domain_is_active: 1,
    }, [{ filename: 'report.bin', r2_key: 'attachments/report.bin' }])
    delete env.RESEND_API_KEY
    delete env.RESEND_FROM
    env.SENDFLARE_API_KEY = 'sf_global'
    env.MAIL_BUCKET.get = vi.fn(async () => new Response(JSON.stringify({
      text: 'Attached', html: '<p>Attached</p>',
    })) as unknown as R2ObjectBody)
    const provider = vi.fn()
    vi.stubGlobal('fetch', provider)

    await expect(deliverOutboundMessage(env, {
      kind: 'outbound', messageId: 'out-sendflare-attachment', userId: user.id,
      ip: '127.0.0.1', auditAction: 'message.send', auditDetail: { attachmentCount: 1 },
    })).rejects.toMatchObject({
      message: 'SendFlare does not support attachments; configure Resend as a fallback for this domain',
      retryable: false,
    })
    expect(provider).not.toHaveBeenCalled()
  })
})
