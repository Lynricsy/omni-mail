import { afterEach, describe, expect, it, vi } from 'vitest'
import { BACKUP_DATABASE_IDENTITY, validateBackupTarget } from './backup-target'
import type { Env } from '../../app/types'

function environment(identity = 'local-database'): Env {
  return {
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
    D1_DATABASE_ID: 'database-id',
    D1_REST_API_TOKEN: 'read-token',
    DB: {
      prepare: () => ({
        bind: () => ({ first: async () => ({ value: identity }) }),
      }),
    },
  } as unknown as Env
}

function queryResponse(value: string, status = 200) {
  return new Response(JSON.stringify({
    success: status === 200,
    result: [{ success: status === 200, results: [{ value }] }],
  }), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('backup target validation', () => {
  it('accepts the D1 database that matches the current Worker binding', async () => {
    const request = vi.fn(async () => queryResponse('local-database'))
    vi.stubGlobal('fetch', request)
    await expect(validateBackupTarget(environment())).resolves.toBeUndefined()
    expect(request).toHaveBeenCalledOnce()
    const [url, init] = request.mock.calls[0]
    expect(url).toContain('/accounts/account-id/d1/database/database-id/query')
    expect(JSON.parse(init?.body as string)).toEqual({
      sql: 'SELECT value FROM settings WHERE key = ?',
      params: [BACKUP_DATABASE_IDENTITY],
    })
  })

  it('rejects another valid D1 database instead of backing it up', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => queryResponse('other-database')))
    await expect(validateBackupTarget(environment())).rejects.toThrow(
      'D1_DATABASE_ID 与当前 Worker 的 DB 绑定不一致。',
    )
  })

  it('rejects an inaccessible account or database', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => queryResponse('', 403)))
    await expect(validateBackupTarget(environment())).rejects.toThrow(
      '无法验证备份目标数据库（403）。',
    )
  })
})
