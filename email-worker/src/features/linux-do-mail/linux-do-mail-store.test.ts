import { describe, expect, it } from 'vitest'
import { LinuxDoMailAccountStore, publicLinuxDoMailAccount } from './linux-do-mail-store'
import type { LinuxDoMailAccount } from './linux-do-mail-types'
import type { Env } from '../../app/types'

describe('Linux DO Mail storage boundary', () => {
  it('never exposes the password or user ownership', () => {
    const account: LinuxDoMailAccount = {
      id: 'linuxdo-mail-1',
      userId: 'user-1',
      username: 'member@linux.do',
      password: 'secret-token',
      status: 'active',
      lastValidated: '2026-08-22T00:00:00.000Z',
      lastError: '',
      createdAt: '2026-08-22T00:00:00.000Z',
    }

    const result = publicLinuxDoMailAccount(account)
    expect(result).toMatchObject({ username: 'member@linux.do', hasPassword: true })
    expect(JSON.stringify(result)).not.toContain('secret-token')
    expect(result).not.toHaveProperty('userId')
    expect(result).not.toHaveProperty('password')
  })

  it('can delete corrupted credentials without decrypting them', async () => {
    const statements: string[] = []
    const env = {
      LINUX_DO_MAIL_CREDENTIALS_KEY: 'test-key-that-is-longer-than-thirty-two-characters',
      DB: {
        prepare(sql: string) {
          statements.push(sql)
          return { bind: () => ({
            first: async () => ({
              id: 'linuxdo-mail-1', username: 'member@linux.do', status: 'error',
              last_validated: '', last_error: '凭据已损坏',
              created_at: '2026-08-22T00:00:00.000Z',
            }),
            run: async () => ({ meta: { changes: 1 } }),
          }) }
        },
      },
    } as unknown as Env

    await expect(new LinuxDoMailAccountStore(env, 'user-1').remove()).resolves.toMatchObject({
      id: 'linuxdo-mail-1', username: 'member@linux.do', hasPassword: true,
    })
    expect(statements[0]).not.toContain('password_cipher')
    expect(statements[1]).toContain('DELETE FROM linux_do_mail_accounts')
  })
})
