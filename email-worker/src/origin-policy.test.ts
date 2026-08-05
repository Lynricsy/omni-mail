import { describe, expect, it } from 'vitest'
import {
  allowedTurnstileHostnames,
  configuredOrigins,
  isAllowedOrigin,
} from './origin-policy'

describe('request origin policy', () => {
  it('always permits the Worker own origin', () => {
    expect(isAllowedOrigin(
      'https://mail.example.com',
      'https://mail.example.com/api/login',
      undefined,
    )).toBe(true)
  })

  it('permits configured additional origins and rejects others', () => {
    expect(isAllowedOrigin(
      'https://desktop.example.com',
      'https://mail.example.com/api/login',
      'https://desktop.example.com',
    )).toBe(true)
    expect(isAllowedOrigin(
      'https://attacker.example',
      'https://mail.example.com/api/login',
      'https://desktop.example.com',
    )).toBe(false)
  })

  it('keeps the split-port local development origin by default', () => {
    expect(configuredOrigins(undefined)).toEqual(['http://localhost:5173'])
  })

  it('uses the current Webmail host for Turnstile validation', () => {
    expect(allowedTurnstileHostnames(
      undefined,
      'https://mail.example.com',
    )).toContain('mail.example.com')
  })
})
