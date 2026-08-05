import { describe, expect, it, vi } from 'vitest'
import {
  isNewerVersion,
  startSystemUpdate,
  systemUpdateStatus,
  systemVersion,
} from './system-version'
import type { Env, SessionUser } from './types'

const administrator: SessionUser = {
  id: 'admin-1',
  email: 'owner@example.com',
  displayName: 'Owner',
  role: 'super_admin',
  mailboxLimit: 100,
  storageQuotaBytes: 5 * 1024 ** 3,
  storageUsedBytes: 0,
  canCreateMailboxes: true,
  canReply: true,
  canTranslate: true,
  temporaryExpiresAt: null,
}

function environment(overrides: Partial<Env> = {}): Env {
  const statement = {
    bind: vi.fn(function bind() { return statement }),
    run: vi.fn(async () => ({ meta: { changes: 1 } })),
  }
  return {
    DB: { prepare: vi.fn(() => statement) },
    ...overrides,
  } as unknown as Env
}

function automaticEnvironment(): Env {
  return environment({
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
    CLOUDFLARE_BUILDS_TRIGGER_ID: 'trigger-id',
    CLOUDFLARE_BUILDS_API_TOKEN: 'builds-token',
    CLOUDFLARE_BUILDS_BRANCH: 'main',
  })
}

describe('system version', () => {
  it('compares stable release versions', () => {
    expect(isNewerVersion('v0.2.0', '0.1.0')).toBe(true)
    expect(isNewerVersion('0.1.1', 'v0.1.0')).toBe(true)
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('not-a-version', '0.1.0')).toBe(false)
  })

  it('checks the configured release repository and reports manual mode', async () => {
    const releaseFetch = vi.fn(async () => Response.json({ tag_name: 'v0.2.0' }))
    const response = await systemVersion(environment(), administrator, releaseFetch as typeof fetch)
    expect(await response.json()).toMatchObject({
      currentVersion: '0.1.3',
      latestVersion: '0.2.0',
      updateAvailable: true,
      automaticUpdate: false,
      automaticUpdateReason: 'not_configured',
      checkFailed: false,
      releaseRepository: 'mibgb65-cloud/OmniMail',
    })
    const init = releaseFetch.mock.calls[0]?.[1] as RequestInit & {
      cf?: { cacheEverything?: boolean; cacheTtlByStatus?: Record<string, number> }
    }
    expect(init.cf).toEqual({
      cacheEverything: true,
      cacheTtlByStatus: { '200-299': 3600, 404: 300, '500-599': 0 },
    })
  })

  it('enables automatic updates only for the super administrator', async () => {
    const releaseFetch = vi.fn(async () => Response.json({ tag_name: 'v0.2.0' }))
    const enabled = await systemVersion(
      automaticEnvironment(), administrator, releaseFetch as typeof fetch,
    )
    const admin = await systemVersion(
      automaticEnvironment(), { ...administrator, role: 'admin' }, releaseFetch as typeof fetch,
    )
    expect(await enabled.json()).toMatchObject({ automaticUpdate: true })
    expect(await admin.json()).toMatchObject({
      automaticUpdate: false,
      automaticUpdateReason: 'super_admin_required',
    })
  })

  it('keeps the installed version visible when GitHub is unavailable', async () => {
    const releaseFetch = vi.fn(async () => new Response(null, { status: 503 }))
    const response = await systemVersion(environment(), administrator, releaseFetch as typeof fetch)
    expect(await response.json()).toMatchObject({
      currentVersion: '0.1.3',
      latestVersion: null,
      updateAvailable: false,
      checkFailed: true,
    })
  })

  it('rejects non-administrator accounts without contacting GitHub', async () => {
    const releaseFetch = vi.fn()
    const response = await systemVersion(
      environment(),
      { ...administrator, role: 'user' },
      releaseFetch as typeof fetch,
    )
    expect(response.status).toBe(403)
    expect(releaseFetch).not.toHaveBeenCalled()
  })
})

describe('system update builds', () => {
  it('pins the Cloudflare production build to the latest release commit', async () => {
    const commitHash = 'a'.repeat(40)
    const buildId = '11111111-1111-4111-8111-111111111111'
    const releaseFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/releases/latest')) return Response.json({ tag_name: 'v0.2.0' })
      if (url.includes('/git/ref/tags/')) {
        return Response.json({ object: { type: 'commit', sha: commitHash } })
      }
      return Response.json({
        success: true,
        result: { build_uuid: buildId, status: 'queued' },
      })
    })
    const response = await startSystemUpdate(
      automaticEnvironment(),
      administrator,
      new Request('https://mail.example/api/admin/version/update', {
        method: 'POST',
        body: JSON.stringify({ targetVersion: '0.2.0' }),
      }),
      '127.0.0.1',
      releaseFetch as typeof fetch,
    )
    const cloudflareCall = releaseFetch.mock.calls[2]
    const init = cloudflareCall?.[1] as RequestInit
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      build: { id: buildId, targetVersion: '0.2.0', state: 'queued' },
    })
    expect(String(cloudflareCall?.[0])).toContain('/builds/triggers/trigger-id/builds')
    expect(JSON.parse(String(init.body))).toEqual({ branch: 'main', commit_hash: commitHash })
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer builds-token')
  })

  it('does not let ordinary administrators trigger a build', async () => {
    const releaseFetch = vi.fn()
    const response = await startSystemUpdate(
      automaticEnvironment(),
      { ...administrator, role: 'admin' },
      new Request('https://mail.example', { method: 'POST', body: '{}' }),
      '127.0.0.1',
      releaseFetch as typeof fetch,
    )
    expect(response.status).toBe(403)
    expect(releaseFetch).not.toHaveBeenCalled()
  })

  it('maps a completed Cloudflare build to a successful update', async () => {
    const buildId = '11111111-1111-4111-8111-111111111111'
    const releaseFetch = vi.fn(async () => Response.json({
      success: true,
      result: { build_uuid: buildId, status: 'stopped', build_outcome: 'success' },
    }))
    const response = await systemUpdateStatus(
      automaticEnvironment(), administrator, buildId, releaseFetch as typeof fetch,
    )
    expect(await response.json()).toEqual({ build: { id: buildId, state: 'succeeded' } })
  })
})
