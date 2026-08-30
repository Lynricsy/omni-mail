import { describe, expect, it } from 'vitest'
import { createLinuxDoMailAccount, getLinuxDoMailAccount } from './linux-do-mail-api'
import type { Env, SessionUser } from '../../app/types'

const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: false, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

function request(body: unknown): Request {
  return new Request('https://mail.example.com/api/linux-do-mail/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Linux DO Mail account API validation', () => {
  it('reports the feature as disabled without touching D1', async () => {
    const response = await getLinuxDoMailAccount({} as Env, user)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ enabled: false, account: null })
  })

  it('requires a full linux.do mailbox username', async () => {
    const response = await createLinuxDoMailAccount(
      {} as Env,
      user,
      request({ username: 'forum-user', password: 'secret' }),
      '192.0.2.1',
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: '请填写完整的 @linux.do 邮箱地址。',
    })
  })

  it('rejects command-injecting credentials before storage or network access', async () => {
    const response = await createLinuxDoMailAccount(
      {} as Env,
      user,
      request({ username: 'member@linux.do', password: 'secret\r\nA0001 LOGOUT' }),
      '192.0.2.1',
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: '请填写有效的密码或认证令牌。',
    })
  })

  it('requires the dedicated credential encryption key', async () => {
    const response = await createLinuxDoMailAccount(
      {} as Env,
      user,
      request({ username: 'member@linux.do', password: 'secret' }),
      '192.0.2.1',
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Linux DO Mail 功能尚未配置 LINUX_DO_MAIL_CREDENTIALS_KEY。',
    })
  })
})
