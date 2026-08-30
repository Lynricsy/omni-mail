import { describe, expect, it } from 'vitest'
import {
  decryptQqMailCredential,
  encryptQqMailCredential,
  qqMailCredentialsReady,
} from './qq-mail-credentials'
import type { Env } from '../../app/types'

const env = {
  QQ_MAIL_CREDENTIALS_KEY: 'qq-mail-test-key-that-is-longer-than-thirty-two-bytes',
} as Env

describe('QQ Mail credential encryption', () => {
  it('uses the dedicated key and binds ciphertext to the account context', async () => {
    const cipher = await encryptQqMailCredential(
      env,
      'authorization-code',
      'user-1:qq-mail-1:qq-authorization-code',
    )

    expect(cipher).toMatch(/^v1\./)
    expect(cipher).not.toContain('authorization-code')
    await expect(decryptQqMailCredential(
      env,
      cipher,
      'user-1:qq-mail-1:qq-authorization-code',
    )).resolves.toBe('authorization-code')
    await expect(decryptQqMailCredential(
      env,
      cipher,
      'user-2:qq-mail-1:qq-authorization-code',
    )).rejects.toThrow('Unable to decrypt')
  })

  it('requires at least 32 UTF-8 bytes', () => {
    expect(qqMailCredentialsReady({ QQ_MAIL_CREDENTIALS_KEY: 'short' } as Env)).toBe(false)
    expect(qqMailCredentialsReady(env)).toBe(true)
  })
})
