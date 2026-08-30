import { describe, expect, it } from 'vitest'
import { listMessageThread, messageReferenceIds } from './message-thread'
import type { Env, MessageRow, SessionUser } from '../../app/types'

const user = {
  id: 'user-1',
} as SessionUser

describe('message thread references', () => {
  it('collects unique message IDs from threading headers', () => {
    expect(messageReferenceIds(
      '<root@example.com>',
      '<reply@example.com>',
      '<root@example.com> <parent@example.com>',
    )).toEqual([
      '<root@example.com>',
      '<reply@example.com>',
      '<parent@example.com>',
    ])
  })

  it('handles missing threading headers', () => {
    expect(messageReferenceIds(null, undefined, '')).toEqual([])
  })

  it('uses instr for Message-IDs longer than the D1 LIKE pattern limit', async () => {
    const messageId = '<0102019fab7fa382-08d3fe85-d373-47ef-82dd-9e0a58b29dc8-000000@example.com>'
    let query = ''
    let bindings: unknown[] = []
    const statement = {
      bind(...values: unknown[]) {
        bindings = values
        return statement
      },
      all: async () => ({ results: [] }),
    }
    const env = {
      DB: {
        prepare(sql: string) {
          query = sql
          return statement
        },
      },
    } as unknown as Env
    const message = {
      id: 'message-1',
      mailbox_address: 'inbox@example.com',
      message_id: messageId,
      in_reply_to: null,
      references_header: null,
    } as MessageRow

    await listMessageThread(env, user, message)

    expect(query).toContain('instr(')
    expect(query).not.toContain(' LIKE ')
    expect(bindings).toEqual([
      user.id,
      message.mailbox_address,
      message.id,
      messageId,
      messageId,
      messageId,
    ])
  })
})
