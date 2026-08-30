import { describe, expect, it } from 'vitest'
import {
  decryptGmailCredential,
  encryptGmailCredential,
  gmailCredentialsReady,
} from './gmail-credentials'
import type { Env } from '../../app/types'

const env = {
  GMAIL_CREDENTIALS_KEY: 'gmail-test-key-that-is-longer-than-thirty-two-bytes',
} as Env

describe('Gmail credential encryption', () => {
  it('uses the dedicated key and binds ciphertext to the account context', async () => {
    const cipher = await encryptGmailCredential(
      env,
      'abcdefghijklmnop',
      'user-1:gmail-1:app-password',
    )

    expect(cipher).toMatch(/^v1\./)
    expect(cipher).not.toContain('abcdefghijklmnop')
    await expect(decryptGmailCredential(
      env,
      cipher,
      'user-1:gmail-1:app-password',
    )).resolves.toBe('abcdefghijklmnop')
    await expect(decryptGmailCredential(
      env,
      cipher,
      'user-2:gmail-1:app-password',
    )).rejects.toThrow('Unable to decrypt')
  })

  it('requires at least 32 UTF-8 bytes', () => {
    expect(gmailCredentialsReady({ GMAIL_CREDENTIALS_KEY: 'short' } as Env)).toBe(false)
    expect(gmailCredentialsReady(env)).toBe(true)
  })
})
