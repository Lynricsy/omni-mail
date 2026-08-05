import { describe, expect, it } from 'vitest'
import { deploymentCheck, publicSetupRequirements } from './deployment-check'
import type { Env, SessionUser } from './types'

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
    SETUP_TOKEN: 'do-not-return-this-secret',
    RESEND_API_KEY: 're_do-not-return',
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

  it('returns grouped checks to administrators without exposing secrets', async () => {
    const response = await deploymentCheck(environment(), administrator)
    const result = await response.json() as {
      ready: boolean
      checks: Array<{ group: string; state: string }>
    }
    expect(response.status).toBe(200)
    expect(result.ready).toBe(true)
    expect(new Set(result.checks.map((item) => item.group))).toEqual(
      new Set(['core', 'security', 'mail']),
    )
    expect(JSON.stringify(result)).not.toContain('do-not-return')
  })

  it('rejects non-administrator accounts', async () => {
    const response = await deploymentCheck(environment(), {
      ...administrator,
      role: 'user',
    })
    expect(response.status).toBe(403)
  })
})
