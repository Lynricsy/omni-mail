import { describe, expect, it } from 'vitest'
import { publicConfig } from './public-config'
import type { Env } from './types'

function environment(settings: Record<string, string>, credentials = false): Env {
  return {
    DB: {
      prepare: () => ({
        all: async () => ({
          results: Object.entries(settings).map(([key, value]) => ({ key, value })),
        }),
      }),
    },
    MAIL_BUCKET: { get: async () => null },
    MAIL_QUEUE: { send: async () => undefined },
    LINUX_DO_CLIENT_ID: credentials ? 'client' : undefined,
    LINUX_DO_CLIENT_SECRET: credentials ? 'secret' : undefined,
  } as unknown as Env
}

describe('public registration configuration', () => {
  it('makes Linux DO registration available without Turnstile when Connect is configured', async () => {
    const config = await publicConfig(environment({
      external_registration_enabled: '1',
      external_registration_method: 'linuxdo',
    }, true))
    expect(config).toMatchObject({
      registrationEnabled: true,
      registrationAvailable: true,
      registrationMethod: 'linuxdo',
      linuxDoLoginEnabled: true,
      registrationProtectionReady: false,
    })
  })

  it('does not expose an unusable registration entry point', async () => {
    const config = await publicConfig(environment({
      external_registration_enabled: '1',
      external_registration_method: 'linuxdo',
    }))
    expect(config.registrationEnabled).toBe(true)
    expect(config.registrationAvailable).toBe(false)
    expect(config.linuxDoLoginEnabled).toBe(false)
  })

  it('enables sending when only SendFlare is configured', async () => {
    const env = environment({})
    env.SENDFLARE_API_KEY = 'sf_do-not-return'
    const config = await publicConfig(env)
    expect(config.replyEnabled).toBe(true)
    expect(JSON.stringify(config)).not.toContain('sf_do-not-return')
  })
})
