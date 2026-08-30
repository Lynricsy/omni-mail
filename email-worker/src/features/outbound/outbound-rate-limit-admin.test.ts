import { describe, expect, it, vi } from 'vitest'
import {
  getOutboundRateLimitSettings,
  parseOutboundRateLimitOverride,
  parseOutboundRateLimitSettings,
  updateOutboundRateLimitSettings,
  updateUserOutboundRateLimit,
} from './outbound-rate-limit-admin'
import type { Env, SessionUser } from '../../app/types'

const actor: SessionUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  displayName: 'Admin',
  role: 'admin',
  mailboxLimit: 20,
  storageQuotaBytes: 1024 ** 3,
  storageUsedBytes: 0,
  canCreateMailboxes: true,
  canReply: true,
  temporaryExpiresAt: null,
}

function environment(firstRow: unknown = null) {
  const statements: Array<{ sql: string; bindings: unknown[] }> = []
  const batch = vi.fn(async () => [])
  const prepare = (sql: string) => {
    const statement = {
      bind(...bindings: unknown[]) {
        statements.push({ sql, bindings })
        return this
      },
      first: async () => firstRow,
      all: async () => ({ results: [] }),
      run: async () => ({ meta: { changes: 1 } }),
    }
    return statement
  }
  return {
    env: { DB: { prepare, batch } } as unknown as Env,
    statements,
    batch,
  }
}

describe('outbound rate limit administration', () => {
  it('accepts bounded global settings', () => {
    expect(parseOutboundRateLimitSettings({
      enabled: true,
      minuteLimit: 20,
      dayLimit: 500,
    })).toEqual({ enabled: true, minuteLimit: 20, dayLimit: 500 })
  })

  it('rejects malformed or excessive global settings', () => {
    expect(parseOutboundRateLimitSettings({
      enabled: 'true', minuteLimit: 20, dayLimit: 500,
    })).toBeNull()
    expect(parseOutboundRateLimitSettings({
      enabled: true, minuteLimit: 101, dayLimit: 500,
    })).toBeNull()
    expect(parseOutboundRateLimitSettings({
      enabled: true, minuteLimit: 20, dayLimit: 10_001,
    })).toBeNull()
  })

  it('uses null overrides to inherit global limits', () => {
    expect(parseOutboundRateLimitOverride({
      minuteLimit: null,
      dayLimit: 1_000,
    })).toEqual({ minuteLimit: null, dayLimit: 1_000 })
    expect(parseOutboundRateLimitOverride({
      minuteLimit: undefined,
      dayLimit: null,
    })).toBeNull()
  })

  it('stores global settings as one batch and writes an audit event', async () => {
    const { env, statements, batch } = environment()
    const response = await updateOutboundRateLimitSettings(
      env,
      actor,
      new Request('https://example.com', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true, minuteLimit: 20, dayLimit: 500 }),
      }),
      '127.0.0.1',
    )

    expect(response.status).toBe(200)
    expect(batch).toHaveBeenCalledOnce()
    expect(batch.mock.calls[0][0]).toHaveLength(3)
    expect(statements.some(({ bindings }) => (
      bindings.includes('system.outbound_rate_limit.update')
    ))).toBe(true)
  })

  it('keeps regular administrators from changing another administrator', async () => {
    const { env, statements } = environment({
      id: 'admin-2',
      email: 'other-admin@example.com',
      role: 'admin',
      outbound_minute_limit: null,
      outbound_day_limit: null,
    })
    const response = await updateUserOutboundRateLimit(
      env,
      actor,
      'owner@example.com',
      'admin-2',
      new Request('https://example.com', {
        method: 'PATCH',
        body: JSON.stringify({ minuteLimit: 5, dayLimit: 100 }),
      }),
      '127.0.0.1',
    )

    expect(response.status).toBe(403)
    expect(statements.some(({ sql }) => sql.startsWith('UPDATE users'))).toBe(false)
  })

  it('rejects non-administrators before reading settings', async () => {
    const { env, statements } = environment()
    const response = await getOutboundRateLimitSettings(env, { ...actor, role: 'user' })
    expect(response.status).toBe(403)
    expect(statements).toHaveLength(0)
  })
})
