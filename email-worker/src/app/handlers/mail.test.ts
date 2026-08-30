import { describe, expect, it, vi } from 'vitest'
import {
  baseMailboxAddress,
  consumeEmailQueue,
  mailboxForRecipient,
  MAX_INBOUND_MESSAGE_BYTES,
  parseMessage,
  queueFailureStatus,
  receiveEmail,
  replySubject,
  textPreview,
  textToHtml,
} from './mail'
import type { Env } from '../types'

vi.mock('../../platform/d1/schema', () => ({ ensureSchema: vi.fn() }))

describe('mail helpers', () => {
  it('routes unassigned managed-domain mail to the owner only when enabled', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const database = (enabled: boolean) => ({
      prepare(sql: string) {
        const entry = { sql, bindings: [] as unknown[] }
        statements.push(entry)
        const statement = {
          bind(...bindings: unknown[]) {
            entry.bindings = bindings
            return statement
          },
          first: async () => sql.includes('FROM users u') && enabled
            ? { id: 'owner-1' }
            : null,
          run: async () => ({ meta: { changes: 1 } }),
        }
        return statement
      },
    })
    const environment = (enabled: boolean) => ({
      DB: database(enabled),
      SUPER_ADMIN_EMAIL: 'owner@example.com',
    }) as unknown as Env

    await expect(
      mailboxForRecipient(environment(false), 'unknown@example.com'),
    ).resolves.toBeNull()
    await expect(
      mailboxForRecipient(environment(true), 'Unknown@Example.com'),
    ).resolves.toEqual({
      address: '__unassigned__@omnimail.invalid',
      userId: 'owner-1',
      deliveredTo: 'unknown@example.com',
    })
    const ownerLookup = statements.find(({ sql }) => sql.includes('FROM users u'))
    const mailboxLookup = statements.find(({ sql }) => sql.includes('FROM mailboxes mb'))
    expect(mailboxLookup?.sql).toContain('FROM domains d')
    expect(mailboxLookup?.bindings).toContain('example.com')
    expect(ownerLookup?.sql).toContain("s.key = 'unassigned_mail_enabled'")
    expect(ownerLookup?.sql).toContain('FROM domains d')
  })

  it('rejects oversized messages before reading or storing the raw stream', async () => {
    const database = { prepare: vi.fn() }
    const message = {
      to: 'owner@example.com',
      from: 'sender@example.net',
      rawSize: MAX_INBOUND_MESSAGE_BYTES + 1,
      raw: new Response('not read').body,
      headers: new Headers(),
      setReject: vi.fn(),
    }

    await receiveEmail(message as unknown as ForwardableEmailMessage, {
      DB: database,
    } as unknown as Env)

    expect(message.setReject).toHaveBeenCalledWith('Message exceeds the 20 MiB OmniMail limit')
    expect(database.prepare).not.toHaveBeenCalled()
  })

  it('stores unassigned mail with its original recipient', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const db = {
      prepare(sql: string) {
        const entry = { sql, bindings: [] as unknown[] }
        statements.push(entry)
        const statement = {
          bind(...bindings: unknown[]) {
            entry.bindings = bindings
            return statement
          },
          first: async () => sql.includes('FROM users u') ? { id: 'owner-1' } : null,
          run: async () => ({ meta: { changes: 1 } }),
        }
        return statement
      },
    }
    const queue = { send: vi.fn().mockResolvedValue(undefined) }
    const bucket = {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const message = {
      to: 'unknown@example.com',
      from: 'sender@example.net',
      rawSize: 20,
      raw: new Response('Subject: Test\r\n\r\nHello').body,
      headers: new Headers({ subject: 'Test', 'message-id': '<test@example.net>' }),
      setReject: vi.fn(),
    }

    await receiveEmail(message as unknown as ForwardableEmailMessage, {
      DB: db,
      MAIL_QUEUE: queue,
      MAIL_BUCKET: bucket,
      SUPER_ADMIN_EMAIL: 'owner@example.com',
    } as unknown as Env)
    const insert = statements.find(({ sql }) => sql.includes('INSERT OR IGNORE INTO messages'))

    expect(message.setReject).not.toHaveBeenCalled()
    expect(insert?.bindings[1]).toBe('__unassigned__@omnimail.invalid')
    expect(insert?.bindings[4]).toBe('unknown@example.com')
    expect(queue.send).toHaveBeenCalledTimes(1)
  })

  it('resolves plus addressing to the base mailbox', () => {
    expect(baseMailboxAddress('Owner+news@Example.com')).toBe('owner@example.com')
    expect(baseMailboxAddress('owner@example.com')).toBe('owner@example.com')
  })

  it('adds a reply prefix only once', () => {
    expect(replySubject('Hello')).toBe('Re: Hello')
    expect(replySubject('RE: Hello')).toBe('RE: Hello')
    expect(replySubject('  ')).toBe('Re: 无主题')
  })

  it('creates a compact, bounded preview', () => {
    expect(textPreview('hello\n\n  world')).toBe('hello world')
    expect(textPreview('123456', 5)).toBe('1234…')
  })

  it('escapes reply text before creating HTML', () => {
    expect(textToHtml('<script>alert(1)</script>\nnext'))
      .toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;<br>next</p>')
  })

  it('retries exhausted parse failures so Queue can move them to the DLQ', async () => {
    const message = {
      body: { messageId: 'message-1' },
      attempts: 3,
      ack: vi.fn(),
      retry: vi.fn(),
    }
    const db = {
      prepare: (sql: string) => ({
        bind() {
          return this
        },
        first: async () => sql.includes('SELECT * FROM messages')
          ? { status: 'queued', raw_key: null }
          : null,
        run: async () => ({ success: true }),
      }),
    }

    await consumeEmailQueue(
      { messages: [message] } as unknown as MessageBatch<{ messageId: string }>,
      { DB: db } as unknown as Parameters<typeof consumeEmailQueue>[1],
    )

    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 30 })
    expect(message.ack).not.toHaveBeenCalled()
  })

  it('only exposes a failure after automatic Queue retries are exhausted', () => {
    expect(queueFailureStatus(1)).toBe('processing')
    expect(queueFailureStatus(2)).toBe('processing')
    expect(queueFailureStatus(3)).toBe('failed')
  })

  it('persists Reply-To and physical object bytes after parsing', async () => {
    const rawMessage = [
      'From: Sender <sender@example.net>',
      'Reply-To: Support <support@example.org>',
      'To: owner@example.com',
      'Subject: Test',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Hello',
    ].join('\r\n')
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
          first: async () => ({
            id: 'message-1',
            status: 'processing',
            raw_key: 'raw/message-1.eml',
            sender_address: 'sender@example.net',
            subject: 'Test',
            received_at: 1,
            size: rawMessage.length,
          }),
        }
        return statement
      },
      batch: vi.fn().mockResolvedValue([]),
    }
    const bucket = {
      get: vi.fn().mockResolvedValue(new Response(rawMessage)),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }

    await parseMessage(
      { messageId: 'message-1' },
      { DB: database, MAIL_BUCKET: bucket } as unknown as Env,
    )

    const update = statements.find(({ sql }) => sql.includes('UPDATE messages SET'))
    expect(update?.sql).toContain('reply_to_json = ?')
    expect(update?.sql).toContain('stored_bytes = ?')
    expect(update?.bindings).toContain('["support@example.org"]')
    expect(update?.bindings).toContainEqual(expect.any(Number))
  })

  it('removes newly written R2 objects when the parse transaction fails', async () => {
    const rawMessage = [
      'From: sender@example.net',
      'To: owner@example.com',
      'Subject: Test',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Hello',
    ].join('\r\n')
    const database = {
      prepare(sql: string) {
        const statement = {
          bind() {
            return statement
          },
          first: async () => sql.includes('SELECT * FROM messages')
            ? {
                id: 'message-1',
                status: 'processing',
                raw_key: 'raw/message-1.eml',
                sender_address: 'sender@example.net',
                subject: 'Test',
                received_at: 1,
                size: rawMessage.length,
              }
            : null,
        }
        return statement
      },
      batch: vi.fn().mockRejectedValue(new Error('D1 transaction failed')),
    }
    const bucket = {
      get: vi.fn().mockResolvedValue(new Response(rawMessage)),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }

    await expect(parseMessage(
      { messageId: 'message-1' },
      { DB: database, MAIL_BUCKET: bucket } as unknown as Env,
    )).rejects.toThrow('D1 transaction failed')

    expect(bucket.delete).toHaveBeenCalledWith(['bodies/message-1.json'])
  })
})
