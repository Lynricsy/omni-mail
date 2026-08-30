import { describe, expect, it } from 'vitest'
import { bulkUpdateMessages, parseBulkMessageInput } from './message-bulk-api'
import type { Env, SessionUser } from '../../app/types'

const user: SessionUser = {
  id: 'user-1',
  email: 'owner@example.com',
  displayName: 'Owner',
  role: 'super_admin',
  mailboxLimit: 100,
  storageQuotaBytes: 0,
  storageUsedBytes: 0,
  canCreateMailboxes: true,
  canReply: true,
  temporaryExpiresAt: null,
}

describe('bulk message input', () => {
  it('accepts supported actions and removes duplicate IDs', () => {
    expect(parseBulkMessageInput({ ids: ['a', 'a', 'b'], action: 'trash' })).toEqual({
      ids: ['a', 'b'],
      action: 'trash',
    })
  })

  it('rejects empty, oversized, or malformed requests', () => {
    expect(parseBulkMessageInput({ ids: [], action: 'read' })).toBeNull()
    expect(parseBulkMessageInput({ ids: Array.from({ length: 51 }, (_, i) => `m-${i}`), action: 'read' })).toBeNull()
    expect(parseBulkMessageInput({ ids: ['../message'], action: 'read' })).toBeNull()
    expect(parseBulkMessageInput({ ids: ['message-1'], action: 'archive' })).toBeNull()
  })

  it('scopes updates to mailboxes owned by the current user', async () => {
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
          run: async () => ({ meta: { changes: sql.startsWith('UPDATE messages') ? 2 : 1 } }),
        }
        return statement
      },
    }
    const request = new Request('https://mail.example.com/api/messages/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['message-1', 'message-2'], action: 'read' }),
    })
    const response = await bulkUpdateMessages(
      { DB: db } as unknown as Env,
      user,
      request,
      '127.0.0.1',
    )
    const update = statements.find(({ sql }) => sql.startsWith('UPDATE messages'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ updatedCount: 2 })
    expect(update?.sql).toContain('SELECT address FROM mailboxes WHERE user_id = ?')
    expect(update?.bindings).toEqual([1, 'message-1', 'message-2', user.id])
  })
})
