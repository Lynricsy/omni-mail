import { describe, expect, it } from 'vitest'
import { getLinuxDoMailSentMessage, listLinuxDoMailSent } from './linux-do-mail-api'
import type { Env, SessionUser } from '../../app/types'

const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: true, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

const accountRow = {
  id: 'linuxdo-mail-1', username: 'member@linux.do', status: 'active',
  last_validated: '2026-08-22T00:00:00.000Z', last_error: '',
  created_at: '2026-08-22T00:00:00.000Z',
}

const sentRow = {
  id: 'message-1', status: 'sent', sender_address: 'member@linux.do',
  recipients_json: '["friend@example.com"]', subject: 'Hello', preview: 'Preview',
  sent_at: 1_777_000_000, created_at: 1_777_000_000, body_key: 'bodies/message-1.json',
  delivery_status: 'sent', processing_error: null,
}

function testEnv() {
  const bindings: unknown[][] = []
  const env = {
    LINUX_DO_MAIL_CREDENTIALS_KEY: 'test-key-that-is-longer-than-thirty-two-characters',
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => {
          bindings.push(values)
          return {
            first: async () => sql.includes('linux_do_mail_accounts') ? accountRow : sentRow,
            all: async () => ({ results: [sentRow] }),
          }
        },
      }),
    },
    MAIL_BUCKET: {
      get: async (key: string) => key === sentRow.body_key ? {
        json: async () => ({ text: 'Full body', html: '<p>Full body</p>' }),
      } : null,
    },
  } as unknown as Env
  return { env, bindings }
}

describe('Linux DO Mail sent API', () => {
  it('lists only the connected user hidden mailbox messages', async () => {
    const { env, bindings } = testEnv()
    const response = await listLinuxDoMailSent(env, user)
    const body = await response.json() as { messages: Array<Record<string, unknown>> }

    expect(response.status).toBe(200)
    expect(body.messages[0]).toMatchObject({
      id: 'message-1', from: 'member@linux.do', to: 'friend@example.com',
      subject: 'Hello', direction: 'outgoing', status: 'sent', deliveryStatus: 'sent',
    })
    expect(bindings).toContainEqual(['member@linux.do', 'user-1'])
  })

  it('loads the stored R2 body for an owned sent message', async () => {
    const { env, bindings } = testEnv()
    const response = await getLinuxDoMailSentMessage(env, user, 'message-1')
    const body = await response.json() as { message: Record<string, unknown> }

    expect(response.status).toBe(200)
    expect(body.message).toMatchObject({ body: 'Full body', html: '<p>Full body</p>' })
    expect(bindings).toContainEqual(['message-1', 'member@linux.do', 'user-1'])
  })

  it('binds sent search terms to the existing message index query', async () => {
    const { env, bindings } = testEnv()
    const response = await listLinuxDoMailSent(
      env,
      user,
      new Request('https://mail.example.com/api/linux-do-mail/sent?q=Greeting'),
    )

    expect(response.status).toBe(200)
    expect(bindings).toContainEqual([
      'member@linux.do', 'user-1', '%greeting%', '%greeting%', '%greeting%',
    ])
  })
})
