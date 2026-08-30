import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQqMailIdentity, deleteQqMailIdentity } from './qq-mail-identity-api'
import type { Env, SessionUser } from '../../app/types'

const mocks = vi.hoisted(() => ({
  validate: vi.fn(async () => undefined),
  insert: vi.fn(),
  remove: vi.fn(),
  get: vi.fn(),
  audit: vi.fn(async () => undefined),
}))

vi.mock('./qq-mail-api-shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('./qq-mail-api-shared')>()
  return { ...original, claimQqMailValidationAttempt: vi.fn(async () => undefined),
    validateQqMailSenderIdentity: mocks.validate }
})
vi.mock('../../shared/audit/audit', () => ({ writeAudit: mocks.audit }))
vi.mock('./qq-mail-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('./qq-mail-store')>()
  return { ...original, QqMailAccountStore: class {
    get = mocks.get
    insertIdentity = mocks.insert
    removeIdentity = mocks.remove
  } }
})

const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: true, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

const account = {
  id: 'qq-1', userId: user.id, name: 'QQ', email: '123456789@qq.com',
  authorizationCode: 'authorization-code', status: 'active', identities: [{
    id: 'qq-1', accountId: 'qq-1', name: 'QQ', email: '123456789@qq.com',
    isPrimary: true, createdAt: 1, updatedAt: 1,
  }],
}

function request(body: unknown) {
  return new Request('https://mail.example.com/api/qq-mail/accounts/qq-1/identities', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('QQ Mail identity API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue(account)
    mocks.insert.mockImplementation(async (_accountId, identity) => ({
      ...account, identities: [...account.identities, identity],
    }))
    mocks.remove.mockResolvedValue(account)
  })

  it('verifies SMTP before persisting a supported identity', async () => {
    const response = await createQqMailIdentity({} as Env, user, 'qq-1', request({
      name: 'Foxmail', email: 'work@foxmail.com',
    }), '192.0.2.1')

    expect(response.status).toBe(201)
    expect(mocks.validate).toHaveBeenCalledWith('work@foxmail.com', 'authorization-code')
    expect(mocks.insert).toHaveBeenCalledWith('qq-1', expect.objectContaining({
      name: 'Foxmail', email: 'work@foxmail.com', isPrimary: false,
    }))
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(), user.id, 'qq_mail.identity.create', expect.any(String), '192.0.2.1',
      expect.objectContaining({
        accountId: 'qq-1', accountName: 'QQ', identityName: 'Foxmail',
        email: 'wo***@foxmail.com',
      }),
    )
  })

  it('never persists an identity when SMTP verification fails', async () => {
    mocks.validate.mockRejectedValueOnce(new Error('SMTP rejected'))
    const response = await createQqMailIdentity({} as Env, user, 'qq-1', request({
      name: 'Foxmail', email: 'work@foxmail.com',
    }), '192.0.2.1')

    expect(response.status).toBe(500)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('does not delete the primary identity', async () => {
    const response = await deleteQqMailIdentity({} as Env, user, 'qq-1', 'qq-1', '192.0.2.1')
    expect(response.status).toBe(409)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
