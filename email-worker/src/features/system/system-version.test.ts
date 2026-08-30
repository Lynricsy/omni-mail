import { describe, expect, it, vi } from 'vitest'
import packageMetadata from '../../../../package.json'
import { isNewerVersion, systemVersion } from './system-version'
import type { Env, SessionUser } from '../../app/types'

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

describe('system version', () => {
  it('compares stable release versions', () => {
    expect(isNewerVersion('v0.2.0', '0.1.0')).toBe(true)
    expect(isNewerVersion('0.1.1', 'v0.1.0')).toBe(true)
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('not-a-version', '0.1.0')).toBe(false)
  })

  it('checks the configured release repository', async () => {
    const releaseFetch = vi.fn(async () => Response.json({
      tag_name: `v${packageMetadata.version}`,
    }))
    const response = await systemVersion(environment(), administrator, releaseFetch as typeof fetch)
    const body = await response.json()
    expect(body).toMatchObject({
      currentVersion: packageMetadata.version,
      latestVersion: packageMetadata.version,
      updateAvailable: false,
      checkFailed: false,
      releaseRepository: 'mibgb65-cloud/OmniMail',
    })
    expect(body).not.toHaveProperty('automaticUpdate')
    const init = releaseFetch.mock.calls[0]?.[1] as RequestInit & {
      cf?: { cacheEverything?: boolean; cacheTtlByStatus?: Record<string, number> }
    }
    expect(init.cf).toEqual({
      cacheEverything: true,
      cacheTtlByStatus: { '200-299': 3600, 404: 300, '500-599': 0 },
    })
  })

  it('keeps the installed version visible when GitHub is unavailable', async () => {
    const releaseFetch = vi.fn(async () => new Response(null, { status: 503 }))
    const response = await systemVersion(environment(), administrator, releaseFetch as typeof fetch)
    expect(await response.json()).toMatchObject({
      currentVersion: packageMetadata.version,
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
