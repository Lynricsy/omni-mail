import { describe, expect, it } from 'vitest'
import {
  OFFICIAL_CHROME_EXTENSION_ORIGIN,
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

  it('allows only the configured Chrome extension origin', () => {
    const extensionId = 'abcdefghijklmnopabcdefghijklmnop'
    const otherExtensionId = 'ponmlkjihgfedcbaponmlkjihgfedcba'
    const configured = `chrome-extension://${extensionId}`

    expect(configuredOrigins(configured)).toEqual([configured])
    expect(isAllowedOrigin(
      configured,
      'https://mail.example.com/api/auth/token',
      configured,
    )).toBe(true)
    expect(isAllowedOrigin(
      `chrome-extension://${otherExtensionId}`,
      'https://mail.example.com/api/auth/token',
      configured,
    )).toBe(false)
  })

  it('allows the official store extension only when the global switch is enabled', () => {
    expect(isAllowedOrigin(
      OFFICIAL_CHROME_EXTENSION_ORIGIN,
      'https://mail.example.com/api/config',
      OFFICIAL_CHROME_EXTENSION_ORIGIN,
      false,
    )).toBe(false)
    expect(isAllowedOrigin(
      OFFICIAL_CHROME_EXTENSION_ORIGIN,
      'https://mail.example.com/api/config',
      undefined,
      true,
    )).toBe(true)
  })

  it('rejects opaque and malformed extension origins', () => {
    expect(configuredOrigins('file:///tmp/panel.html')).toEqual([])
    expect(configuredOrigins('chrome-extension://not-an-extension-id')).toEqual([])
  })

  it('uses the current Webmail host for Turnstile validation', () => {
    expect(allowedTurnstileHostnames(
      undefined,
      'https://mail.example.com',
    )).toContain('mail.example.com')
  })
})
