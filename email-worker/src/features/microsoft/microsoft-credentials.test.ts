import { describe, expect, it } from 'vitest'
import type { Env } from '../../app/types'
import {
  decryptMicrosoftCredential,
  encryptMicrosoftCredential,
  microsoftCredentialsReady,
} from './microsoft-credentials'

const env = {
  MICROSOFT_CREDENTIALS_KEY: 'microsoft-test-key-that-is-longer-than-thirty-two-bytes',
} as Env

describe('Microsoft credential encryption', () => {
  it('round-trips only with the matching account and credential context', async () => {
    const cipher = await encryptMicrosoftCredential(
      env,
      'refresh-secret',
      'user-1:account-1:refresh-token',
    )
    expect(cipher).not.toContain('refresh-secret')
    await expect(decryptMicrosoftCredential(
      env,
      cipher,
      'user-1:account-1:refresh-token',
    )).resolves.toBe('refresh-secret')
    await expect(decryptMicrosoftCredential(
      env,
      cipher,
      'user-1:account-2:refresh-token',
    )).rejects.toThrow('Unable to decrypt Microsoft credentials')
  })

  it('requires at least 32 UTF-8 bytes of key material', () => {
    expect(microsoftCredentialsReady(env)).toBe(true)
    expect(microsoftCredentialsReady({ MICROSOFT_CREDENTIALS_KEY: 'short' } as Env)).toBe(false)
  })
})
