import { describe, expect, it } from 'vitest'
import {
  decryptICloudCredential,
  encryptICloudCredential,
  iCloudCredentialsReady,
} from './icloud-credentials'
import type { Env } from '../../app/types'

function environment(key = 'test-key-that-is-longer-than-thirty-two-characters'): Env {
  return { ICLOUD_CREDENTIALS_KEY: key } as Env
}

describe('iCloud credential encryption', () => {
  it('round-trips without exposing the plaintext', async () => {
    const env = environment()
    const context = 'user-a:account-a:cookies'
    const encrypted = await encryptICloudCredential(env, 'session=secret', context)

    expect(encrypted).toMatch(/^v1\./)
    expect(encrypted).not.toContain('secret')
    await expect(decryptICloudCredential(env, encrypted, context))
      .resolves.toBe('session=secret')
  })

  it('binds ciphertext to its user, account, and field', async () => {
    const env = environment()
    const encrypted = await encryptICloudCredential(
      env,
      'private',
      'user-a:account-a:cookies',
    )

    await expect(decryptICloudCredential(
      env,
      encrypted,
      'user-b:account-a:cookies',
    )).rejects.toThrow('Unable to decrypt')
    await expect(decryptICloudCredential(
      env,
      encrypted,
      'user-a:account-a:app-password',
    )).rejects.toThrow('Unable to decrypt')
  })

  it('requires at least 32 UTF-8 bytes of secret material', () => {
    expect(iCloudCredentialsReady(environment('too-short'))).toBe(false)
    expect(iCloudCredentialsReady(environment('密'.repeat(11)))).toBe(true)
  })
})
