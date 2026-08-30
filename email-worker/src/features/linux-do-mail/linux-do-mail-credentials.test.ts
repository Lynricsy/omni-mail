import { describe, expect, it } from 'vitest'
import {
  decryptLinuxDoMailCredential,
  encryptLinuxDoMailCredential,
  linuxDoMailCredentialsReady,
} from './linux-do-mail-credentials'
import type { Env } from '../../app/types'

function environment(key = 'test-key-that-is-longer-than-thirty-two-characters'): Env {
  return { LINUX_DO_MAIL_CREDENTIALS_KEY: key } as Env
}

describe('Linux DO Mail credential encryption', () => {
  it('round-trips without exposing the plaintext', async () => {
    const encrypted = await encryptLinuxDoMailCredential(
      environment(),
      'mail-auth-token',
      'user-a:account-a:password',
    )

    expect(encrypted).toMatch(/^v1\./)
    expect(encrypted).not.toContain('mail-auth-token')
    await expect(decryptLinuxDoMailCredential(
      environment(),
      encrypted,
      'user-a:account-a:password',
    )).resolves.toBe('mail-auth-token')
  })

  it('binds ciphertext to its user and account', async () => {
    const encrypted = await encryptLinuxDoMailCredential(
      environment(),
      'private',
      'user-a:account-a:password',
    )

    await expect(decryptLinuxDoMailCredential(
      environment(),
      encrypted,
      'user-b:account-a:password',
    )).rejects.toThrow('Unable to decrypt')
  })

  it('requires at least 32 UTF-8 bytes of secret material', () => {
    expect(linuxDoMailCredentialsReady(environment('too-short'))).toBe(false)
    expect(linuxDoMailCredentialsReady(environment('密'.repeat(11)))).toBe(true)
  })
})
