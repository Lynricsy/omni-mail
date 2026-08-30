import { describe, expect, it } from 'vitest'
import { validSetupTokenSecret } from './setup-security'

describe('setup security', () => {
  it('requires at least 32 UTF-8 bytes for SETUP_TOKEN', () => {
    expect(validSetupTokenSecret(undefined)).toBe(false)
    expect(validSetupTokenSecret('a'.repeat(31))).toBe(false)
    expect(validSetupTokenSecret('a'.repeat(32))).toBe(true)
    expect(validSetupTokenSecret('密'.repeat(11))).toBe(true)
  })
})
