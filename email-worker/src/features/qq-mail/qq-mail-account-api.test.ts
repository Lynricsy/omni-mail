import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestQqMailSync } from './qq-mail-account-api'
import type { Env, SessionUser } from '../../app/types'

const mocks = vi.hoisted(() => ({
  audit: vi.fn(async () => undefined),
  enqueue: vi.fn(async () => undefined),
  publicAccount: vi.fn(),
}))

vi.mock('../../shared/audit/audit', () => ({ writeAudit: mocks.audit }))
vi.mock('./qq-mail-api-shared', async (importOriginal) => ({
  ...await importOriginal<typeof import('./qq-mail-api-shared')>(),
  enqueueQqMailSync: mocks.enqueue,
}))
vi.mock('./qq-mail-store', async (importOriginal) => ({
  ...await importOriginal<typeof import('./qq-mail-store')>(),
  QqMailAccountStore: class { publicAccount = mocks.publicAccount },
}))

const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: true, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

describe('QQ Mail manual synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.publicAccount.mockResolvedValue({
      id: 'qq-1', name: 'Personal QQ', email: '123456789@qq.com', status: 'active',
    })
  })

  it('audits the requested account, source, and message limit before queueing', async () => {
    const env = { DB: { prepare: () => ({
      bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }),
    }) } } as unknown as Env
    const deferred: Promise<unknown>[] = []
    const request = new Request('https://mail.example/api/qq-mail/accounts/qq-1/sync', {
      method: 'POST', body: JSON.stringify({ limit: 20 }),
    })
    const response = await requestQqMailSync(
      env, user, 'qq-1', request, '192.0.2.1', (task) => deferred.push(task),
    )

    expect(response.status).toBe(202)
    expect(mocks.audit).toHaveBeenCalledWith(
      env, user.id, 'qq_mail.sync.request', 'qq-1', '192.0.2.1', {
        accountName: 'Personal QQ', email: '12***@qq.com', reason: 'manual', limit: 20,
      },
    )
    expect(mocks.enqueue).toHaveBeenCalledWith(env, 'qq-1', 'manual', 20)
    await Promise.all(deferred)
  })
})
