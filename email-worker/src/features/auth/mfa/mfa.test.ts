import { describe, expect, it } from 'vitest'
import {
  base32Encode,
  consumeMfaChallenge,
  encryptTotpSecret,
  generateRecoveryCodes,
  totpCode,
  verifyEncryptedTotp,
  verifyTotp,
} from './mfa'
import type { Env } from '../../../app/types'

describe('TOTP security', () => {
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

  it('matches the RFC 6238 SHA-1 test secret at 59 seconds', async () => {
    await expect(totpCode(rfcSecret, 59_000)).resolves.toBe('287082')
    await expect(verifyTotp(rfcSecret, '287082', 59_000)).resolves.toBe(true)
  })

  it('encrypts TOTP secrets before database storage', async () => {
    const env = { TOTP_ENCRYPTION_KEY: 'test-key-that-is-longer-than-thirty-two-characters' } as Env
    const encrypted = await encryptTotpSecret(env, rfcSecret)

    expect(encrypted).not.toContain(rfcSecret)
    await expect(verifyEncryptedTotp(env, encrypted, '287082')).resolves.toBe(false)
    await expect(verifyEncryptedTotp(env, encrypted, await totpCode(rfcSecret))).resolves.toBe(true)
  })

  it('creates high-entropy recovery codes in a readable format', () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(8)
    expect(new Set(codes).size).toBe(8)
    expect(codes.every((code) => /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/.test(code))).toBe(true)
    expect(base32Encode(new TextEncoder().encode('foo'))).toBe('MZXW6')
  })

  it('only consumes a login challenge when the database row still exists', async () => {
    const database = (changes: number) => ({
      prepare: () => ({
        bind: () => ({ run: async () => ({ meta: { changes } }) }),
      }),
    }) as unknown as D1Database

    await expect(consumeMfaChallenge(database(1), 'challenge')).resolves.toBe(true)
    await expect(consumeMfaChallenge(database(0), 'challenge')).resolves.toBe(false)
  })
})
