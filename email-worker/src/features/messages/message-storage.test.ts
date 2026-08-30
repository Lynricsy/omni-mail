import { describe, expect, it, vi } from 'vitest'
import { permanentlyDeleteMessage, releaseStorage, reserveStorage } from './message-storage'
import type { Env } from '../../app/types'

function database(changes: number) {
  const run = vi.fn().mockResolvedValue({ meta: { changes } })
  const bind = vi.fn(() => ({ run }))
  const prepare = vi.fn(() => ({ bind }))
  return {
    db: { prepare } as unknown as D1Database,
    prepare,
    bind,
    run,
  }
}

describe('message storage quota', () => {
  it('reserves space only when the atomic quota update succeeds', async () => {
    const available = database(1)
    await expect(reserveStorage(available.db, 'user-1', 4096)).resolves.toBe(true)
    expect(available.bind).toHaveBeenCalledWith(4096, 'user-1', 4096)
    expect(String(available.prepare.mock.calls[0][0])).toContain('storage_quota_bytes = 0')

    const full = database(0)
    await expect(reserveStorage(full.db, 'user-1', 4096)).resolves.toBe(false)
  })

  it('never lets released usage fall below zero', async () => {
    const mocked = database(1)
    await releaseStorage(mocked.db, 'user-1', 4096)
    expect(String(mocked.prepare.mock.calls[0][0])).toContain('MAX(0, storage_used_bytes - ?)')
    expect(mocked.bind).toHaveBeenCalledWith(4096, 'user-1')
  })
})

describe('permanent message deletion', () => {
  it('removes cached translations together with the message objects', async () => {
    const remove = vi.fn(async () => undefined)
    const db = {
      prepare(sql: string) {
        const statement = {
          bind: () => statement,
          all: async () => ({
            results: sql.includes('message_translations')
              ? [{ r2_key: 'translations/message-1/zh.json' }]
              : [{ r2_key: 'attachments/message-1/file' }],
          }),
          run: async () => ({ meta: { changes: 1 } }),
        }
        return statement
      },
      batch: vi.fn(async () => [
        { meta: { changes: 1 } },
        { meta: { changes: 1 } },
        { meta: { changes: 1 } },
      ]),
    }
    await permanentlyDeleteMessage(
      { DB: db, MAIL_BUCKET: { delete: remove } } as unknown as Env,
      'user-1',
      {
        id: 'message-1',
        raw_key: 'raw/message-1.eml',
        body_key: 'bodies/message-1.json',
        quota_bytes: 1024,
      },
    )

    expect(remove).toHaveBeenCalledWith([
      'raw/message-1.eml',
      'bodies/message-1.json',
      'attachments/message-1/file',
      'translations/message-1/zh.json',
    ])
  })

  it('does not release quota or delete R2 objects after another request wins deletion', async () => {
    const remove = vi.fn(async () => undefined)
    const db = {
      prepare(sql: string) {
        return {
          bind() { return this },
          all: async () => ({ results: sql.includes('attachments') ? [] : [] }),
        }
      },
      batch: async () => [
        { meta: { changes: 0 } },
        { meta: { changes: 0 } },
        { meta: { changes: 0 } },
      ],
    }
    await expect(permanentlyDeleteMessage(
      { DB: db, MAIL_BUCKET: { delete: remove } } as unknown as Env,
      'user-1',
      { id: 'message-1', raw_key: 'raw/message-1.eml', body_key: null, quota_bytes: 10 },
    )).resolves.toBe(false)
    expect(remove).not.toHaveBeenCalled()
  })
})
