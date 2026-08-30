import { describe, expect, it, vi } from 'vitest'
import {
  claimRetentionCleanup,
  purgeMailboxMessagesBatch,
  purgeMessagesBatch,
} from './cleanup'
import type { Env } from '../../app/types'

describe('retention cleanup batches', () => {
  it('records a pending cleanup when the interval is claimed', async () => {
    const statements: string[] = []
    const db = {
      prepare(sql: string) {
        statements.push(sql)
        return {
          bind() { return this },
          run: async () => ({ meta: { changes: 1 } }),
        }
      },
    } as unknown as D1Database

    await expect(claimRetentionCleanup(db, 1_800_000_000)).resolves.toBe(true)
    expect(statements.some((sql) => sql.includes('retention_cleanup_pending'))).toBe(true)
  })

  it('deletes one bounded message batch and returns its size', async () => {
    const messages = [
      { id: 'm1', raw_key: 'raw/m1', body_key: null, quota_bytes: 10, user_id: 'u1' },
      { id: 'm2', raw_key: null, body_key: 'bodies/m2', quota_bytes: 20, user_id: 'u1' },
    ]
    const batches = vi.fn(async () => [
      { meta: { changes: 1 } },
      { meta: { changes: 1 } },
      { meta: { changes: 1 } },
    ])
    const db = {
      prepare(sql: string) {
        return {
          bind() { return this },
          all: async () => ({ results: sql.includes('SELECT m.id') ? messages : [] }),
          run: async () => ({ meta: { changes: 1 } }),
        }
      },
      batch: batches,
    }
    const remove = vi.fn(async () => undefined)
    const env = {
      DB: db,
      MAIL_BUCKET: { delete: remove },
    } as unknown as Env

    await expect(purgeMessagesBatch(env, 'expired', 1_800_000_000)).resolves.toBe(2)
    expect(remove).toHaveBeenCalledTimes(2)
    expect(batches).toHaveBeenCalledTimes(2)
  })

  it('limits mailbox cleanup to the requested owner and address', async () => {
    const bindings: unknown[][] = []
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            bindings.push(values)
            return this
          },
          all: async () => ({ results: [] }),
        }
      },
    }
    const env = { DB: db } as unknown as Env

    await expect(purgeMailboxMessagesBatch(
      env, 'user-1', 'alias@example.com',
    )).resolves.toBe(0)
    expect(bindings).toContainEqual(['user-1', 'alias@example.com', 20])
  })
})
