import { describe, expect, it } from 'vitest'
import { bearerToken } from './token-api'

describe('Bearer authorization header', () => {
  it('extracts a case-insensitive Bearer token', () => {
    expect(bearerToken('Bearer om_at_example')).toBe('om_at_example')
    expect(bearerToken('bearer token-value')).toBe('token-value')
  })

  it('distinguishes a missing header from malformed authorization', () => {
    expect(bearerToken(undefined)).toBeUndefined()
    expect(bearerToken('Basic value')).toBeNull()
    expect(bearerToken('Bearer')).toBeNull()
  })
})
