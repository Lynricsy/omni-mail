import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  consumeTemporaryInviteRateLimit,
  registrationProtectionReady,
  verifyRegistrationTurnstile,
} from './registration-security'
import type { Env } from '../../../app/types'

const env = {
  APP_ORIGINS: 'https://mail.example.com,http://localhost:5173',
  TURNSTILE_SITE_KEY: 'site-key',
  TURNSTILE_SECRET_KEY: 'secret-key',
} as Env

afterEach(() => vi.unstubAllGlobals())

describe('registration Turnstile protection', () => {
  it('requires both Turnstile keys', () => {
    expect(registrationProtectionReady(env)).toBe(true)
    expect(registrationProtectionReady({
      ...env,
      TURNSTILE_SECRET_KEY: '',
    })).toBe(false)
  })

  it('accepts the register action from an allowed hostname', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      success: true,
      hostname: 'mail.example.com',
      action: 'register',
    })))
    await expect(
      verifyRegistrationTurnstile(env, 'valid-token', '203.0.113.10'),
    ).resolves.toBe('valid')
  })

  it('accepts the same-origin Worker hostname without APP_ORIGINS', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      success: true,
      hostname: 'mail.example.com',
      action: 'register',
    })))
    await expect(verifyRegistrationTurnstile(
      { ...env, APP_ORIGINS: undefined },
      'valid-token',
      '203.0.113.10',
      'register',
      'https://mail.example.com',
    )).resolves.toBe('valid')
  })

  it('accepts the dedicated action for a multi-use invitation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      success: true,
      hostname: 'mail.example.com',
      action: 'temporary-invite',
    })))
    await expect(
      verifyRegistrationTurnstile(
        env,
        'valid-token',
        '203.0.113.10',
        'temporary-invite',
      ),
    ).resolves.toBe('valid')
  })

  it('accepts Cloudflare test widget metadata during local development', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      success: true,
      hostname: 'example.com',
      action: null,
    })))
    await expect(verifyRegistrationTurnstile({
      ...env,
      TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    }, 'dummy-token', '127.0.0.1')).resolves.toBe('valid')
  })

  it('rejects an unexpected action or hostname', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({
        success: true,
        hostname: 'mail.example.com',
        action: 'login',
      }))
      .mockResolvedValueOnce(Response.json({
        success: true,
        hostname: 'attacker.example',
        action: 'register',
      })))
    await expect(
      verifyRegistrationTurnstile(env, 'wrong-action', '203.0.113.10'),
    ).resolves.toBe('invalid')
    await expect(
      verifyRegistrationTurnstile(env, 'wrong-host', '203.0.113.10'),
    ).resolves.toBe('invalid')
  })

  it('fails closed when Siteverify is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(
      verifyRegistrationTurnstile(env, 'valid-token', '203.0.113.10'),
    ).resolves.toBe('unavailable')
  })
})

describe('single-use invitation rate limiting', () => {
  function database(attempts: number, windowStartedAt: number) {
    const first = vi.fn().mockResolvedValue({
      attempts,
      window_started_at: windowStartedAt,
    })
    const bind = vi.fn(() => ({ first }))
    const prepare = vi.fn(() => ({ bind }))
    return {
      db: { prepare } as unknown as D1Database,
      prepare,
    }
  }

  it('checks IP and invitation-token buckets', async () => {
    const mock = database(1, 1_000)
    await expect(
      consumeTemporaryInviteRateLimit(mock.db, '203.0.113.10', 'invite-1', 1_000),
    ).resolves.toEqual({ allowed: true, retryAfter: 0 })
    expect(mock.prepare).toHaveBeenCalledTimes(3)
  })

  it('returns a retry window after too many attempts', async () => {
    const mock = database(11, 1_000)
    await expect(
      consumeTemporaryInviteRateLimit(mock.db, '203.0.113.10', 'invite-1', 1_000),
    ).resolves.toEqual({ allowed: false, retryAfter: 3_600 })
    expect(mock.prepare).toHaveBeenCalledTimes(1)
  })
})
