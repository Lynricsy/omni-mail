import { describe, expect, it } from 'vitest'
import { deploymentCheck, publicSetupRequirements } from './deployment-check'
import type { Env, SessionUser } from '../../app/types'

const administrator: SessionUser = {
  id: 'admin-1',
  email: 'owner@example.com',
  displayName: 'Owner',
  role: 'super_admin',
  mailboxLimit: 100,
  canCreateMailboxes: true,
  canReply: true,
  temporaryExpiresAt: null,
}

function environment(): Env {
  return {
    DB: {
      prepare: () => ({
        first: async () => ({ domains: 1, mailboxes: 2, setup_complete: '1' }),
      }),
    },
    MAIL_BUCKET: { get: async () => null },
    MAIL_QUEUE: { send: async () => undefined },
    CLEANUP_WORKFLOW: { create: async () => ({}) },
    APP_ORIGINS: 'https://mail.example.com',
    SUPER_ADMIN_EMAIL: 'owner@example.com',
    SETUP_TOKEN: 'do-not-return-this-secret'.repeat(2),
    ICLOUD_CREDENTIALS_KEY: 'icloud-do-not-return-this-secret'.repeat(2),
    GMAIL_CREDENTIALS_KEY: 'gmail-do-not-return-this-secret'.repeat(2),
    MICROSOFT_CREDENTIALS_KEY: 'microsoft-do-not-return-this-secret'.repeat(2),
    YANDEX_MAIL_CREDENTIALS_KEY: 'yandex-do-not-return-this-secret'.repeat(2),
    RESEND_DOMAIN_CONFIGS: JSON.stringify({
      'example.com': { apiKey: 're_do-not-return' },
    }),
  } as unknown as Env
}

describe('deployment check', () => {
  it('reports public setup requirements without returning secret values', () => {
    expect(publicSetupRequirements(environment())).toEqual({
      databaseReady: true,
      storageReady: true,
      queueReady: true,
      superAdminReady: true,
      setupTokenReady: true,
    })
  })

  it('rejects a SETUP_TOKEN shorter than 32 UTF-8 bytes', () => {
    const env = environment()
    env.SETUP_TOKEN = 'too-short'
    expect(publicSetupRequirements(env).setupTokenReady).toBe(false)
  })

  it('returns grouped checks to administrators without exposing secrets', async () => {
    const response = await deploymentCheck(environment(), administrator)
    const result = await response.json() as {
      ready: boolean
      checks: Array<{ id: string; group: string; state: string }>
    }
    expect(response.status).toBe(200)
    expect(result.ready).toBe(true)
    expect(new Set(result.checks.map((item) => item.group))).toEqual(
      new Set(['core', 'security', 'mail']),
    )
    expect(JSON.stringify(result)).not.toContain('do-not-return')
    expect(result.checks.find((item) => item.id === 'gmail-key'))
      .toMatchObject({ state: 'ready' })
    expect(result.checks.find((item) => item.id === 'microsoft-key'))
      .toMatchObject({ state: 'ready' })
    expect(result.checks.find((item) => item.id === 'yandex-mail-key'))
      .toMatchObject({ state: 'ready' })
  })

  it('recognizes multi-account Resend webhook secrets', async () => {
    const env = environment()
    env.RESEND_WEBHOOK_SECRETS = '["whsec_one","whsec_two"]'
    const response = await deploymentCheck(env, administrator)
    const result = await response.json() as {
      checks: Array<{ id: string; state: string }>
    }

    expect(result.checks.find((item) => item.id === 'resend-webhook')).toMatchObject({
      state: 'ready',
    })
  })

  it('rejects non-administrator accounts', async () => {
    const response = await deploymentCheck(environment(), {
      ...administrator,
      role: 'user',
    })
    expect(response.status).toBe(403)
  })
})
