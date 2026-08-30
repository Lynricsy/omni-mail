import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendMessage, validateNewMessage, type NewMessageInput } from './send-message'
import type { Env, SessionUser } from '../../app/types'

const mocks = vi.hoisted(() => ({
  sendOutboundMessage: vi.fn(),
}))

vi.mock('../outbound/outbound-message', () => ({
  sendOutboundMessage: mocks.sendOutboundMessage,
}))

const validInput: NewMessageInput = {
  mailboxAddress: ' Owner@Example.COM ',
  to: ' Friend@Example.NET ',
  subject: ' Hello ',
  text: ' Message body ',
  idempotencyKey: 'request_12345678',
}

beforeEach(() => {
  mocks.sendOutboundMessage.mockReset()
  mocks.sendOutboundMessage.mockResolvedValue(Response.json({ ok: true }))
})

describe('validateNewMessage', () => {
  it('normalizes addresses and trims user-authored content', () => {
    expect(validateNewMessage(validInput)).toEqual({
      value: {
        mailboxAddress: 'owner@example.com',
        to: 'friend@example.net',
        recipients: ['friend@example.net'],
        subject: 'Hello',
        text: 'Message body',
        idempotencyKey: 'request_12345678',
      },
    })
  })

  it('normalizes and deduplicates multiple recipients', () => {
    expect(validateNewMessage({
      ...validInput,
      to: ' First@Example.com, second@example.net; FIRST@example.com ',
    })).toMatchObject({
      value: {
        to: 'first@example.com, second@example.net',
        recipients: ['first@example.com', 'second@example.net'],
      },
    })
  })

  it.each([
    [{ ...validInput, mailboxAddress: 'invalid' }, '发件邮箱格式无效。'],
    [{ ...validInput, to: 'invalid' }, '请输入有效的收件邮箱地址。'],
    [{ ...validInput, to: Array.from({ length: 51 }, (_, index) => (
      `user${index}@example.com`
    )).join(',') }, '一封邮件最多添加 50 个收件人。'],
    [{ ...validInput, subject: ' ' }, '邮件主题需要在 1–500 个字符之间。'],
    [{ ...validInput, subject: 'Hello\r\nBcc: hidden@example.com' }, '邮件主题需要在 1–500 个字符之间。'],
    [{ ...validInput, subject: 'x'.repeat(501) }, '邮件主题需要在 1–500 个字符之间。'],
    [{ ...validInput, text: ' ' }, '邮件正文需要在 1–50,000 个字符之间。'],
    [{ ...validInput, text: 'x'.repeat(50_001) }, '邮件正文需要在 1–50,000 个字符之间。'],
    [{ ...validInput, idempotencyKey: 'short' }, '无效的请求标识。'],
  ] satisfies Array<[NewMessageInput, string]>)('rejects invalid input', (input, error) => {
    expect(validateNewMessage(input)).toEqual({ error })
  })

  it('does not send from a mailbox whose domain is disabled', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const database = {
      prepare(sql: string) {
        const entry = { sql, bindings: [] as unknown[] }
        const statement = {
          bind(...bindings: unknown[]) {
            entry.bindings = bindings
            statements.push(entry)
            return statement
          },
          first: async () => null,
        }
        return statement
      },
    }
    const response = await sendMessage(
      {
        DB: database,
        RESEND_DOMAIN_CONFIGS: JSON.stringify({
          'example.com': { apiKey: 're_test' },
        }),
      } as unknown as Env,
      {
        id: 'user-1',
        role: 'user',
        canReply: true,
      } as SessionUser,
      validInput,
      '127.0.0.1',
    )

    expect(response.status).toBe(404)
    expect(statements[0]?.sql).toContain('FROM domains d')
    expect(statements[0]?.bindings).toContain('example.com')
  })

  it('allows sending with only a matching domain Resend configuration', async () => {
    const database = {
      prepare: () => ({
        bind() { return this },
        first: async () => ({ address: 'owner@example.com' }),
      }),
    }
    const env = {
      DB: database,
      RESEND_DOMAIN_CONFIGS: JSON.stringify({
        'example.com': { apiKey: 're_example' },
      }),
    } as unknown as Env
    const user = {
      id: 'user-1',
      role: 'user',
      canReply: true,
    } as SessionUser

    const response = await sendMessage(env, user, validInput, '127.0.0.1')

    expect(response.status).toBe(200)
    expect(mocks.sendOutboundMessage).toHaveBeenCalledWith(
      env,
      user,
      expect.objectContaining({ mailboxAddress: 'owner@example.com' }),
      '127.0.0.1',
    )
  })

  it('rejects a sender domain without a matching or fallback configuration', async () => {
    const database = {
      prepare: () => ({
        bind() { return this },
        first: async () => ({ address: 'owner@example.com' }),
      }),
    }
    const response = await sendMessage(
      {
        DB: database,
        RESEND_DOMAIN_CONFIGS: JSON.stringify({
          'other.example': { apiKey: 're_other' },
        }),
      } as unknown as Env,
      { id: 'user-1', role: 'user', canReply: true } as SessionUser,
      validInput,
      '127.0.0.1',
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: '该发件域名尚未配置发信服务。' })
    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled()
  })

  it('reports invalid domain Resend JSON', async () => {
    const database = {
      prepare: () => ({
        bind() { return this },
        first: async () => ({ address: 'owner@example.com' }),
      }),
    }
    const response = await sendMessage(
      {
        DB: database,
        RESEND_DOMAIN_CONFIGS: '{invalid',
      } as unknown as Env,
      { id: 'user-1', role: 'user', canReply: true } as SessionUser,
      validInput,
      '127.0.0.1',
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'RESEND_DOMAIN_CONFIGS 格式无效。' })
    expect(mocks.sendOutboundMessage).not.toHaveBeenCalled()
  })
})
