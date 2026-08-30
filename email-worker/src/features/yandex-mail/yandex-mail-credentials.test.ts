import { describe, expect, it } from 'vitest'
import {
  decryptYandexMailCredential,
  encryptYandexMailCredential,
  yandexMailCredentialsReady,
  yandexMailImapEnabled,
} from './yandex-mail-credentials'
import type { Env } from '../../app/types'

const env = {
  YANDEX_MAIL_CREDENTIALS_KEY: 'yandex-mail-test-key-that-is-longer-than-thirty-two-bytes',
} as Env

describe('Yandex Mail credential encryption', () => {
  it('uses the dedicated key and binds ciphertext to the account context', async () => {
    const cipher = await encryptYandexMailCredential(
      env,
      'app-password',
      'user-1:yandex-mail-1:yandex-app-password',
    )

    expect(cipher).toMatch(/^v1\./)
    expect(cipher).not.toContain('app-password')
    await expect(decryptYandexMailCredential(
      env,
      cipher,
      'user-1:yandex-mail-1:yandex-app-password',
    )).resolves.toBe('app-password')
    await expect(decryptYandexMailCredential(
      env,
      cipher,
      'user-2:yandex-mail-1:yandex-app-password',
    )).rejects.toThrow('Unable to decrypt')
  })

  it('requires at least 32 UTF-8 bytes', () => {
    expect(yandexMailCredentialsReady({ YANDEX_MAIL_CREDENTIALS_KEY: 'short' } as Env)).toBe(false)
    expect(yandexMailCredentialsReady(env)).toBe(true)
  })

  it('requires the IMAP feature switch to be explicitly enabled', () => {
    expect(yandexMailImapEnabled(env)).toBe(false)
    expect(yandexMailImapEnabled({ ...env, YANDEX_MAIL_IMAP_ENABLED: 'true' })).toBe(true)
  })
})
