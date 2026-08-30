import { describe, expect, it } from 'vitest'
import {
  claimOutboundSend,
  OUTBOUND_DAY_LIMIT,
  OUTBOUND_MINUTE_LIMIT,
  outboundRateLimitState,
} from './outbound-rate-limit'

function database(
  changes: number,
  row?: Record<string, number>,
  policy: Record<string, unknown> = {
    outbound_minute_limit: null,
    outbound_day_limit: null,
    enabled: '1',
    minute_limit: String(OUTBOUND_MINUTE_LIMIT),
    day_limit: String(OUTBOUND_DAY_LIMIT),
  },
) {
  const statements: Array<{ sql: string; bindings: unknown[] }> = []
  return {
    db: {
      prepare(sql: string) {
        const statement = {
          bindings: [] as unknown[],
          bind(...bindings: unknown[]) {
            this.bindings = bindings
            statements.push({ sql, bindings })
            return this
          },
          run: async () => ({ meta: { changes } }),
          first: async () => sql.includes('FROM users u') ? policy : row ?? null,
        }
        return statement
      },
    } as unknown as D1Database,
    statements,
  }
}

describe('outbound rate limiting', () => {
  it('claims both fixed windows with one atomic statement', async () => {
    const { db, statements } = database(1)

    await expect(claimOutboundSend(db, 'user-1', 125)).resolves.toEqual({ allowed: true })
    expect(statements).toHaveLength(2)
    expect(statements[1].sql).toContain('ON CONFLICT(user_id) DO UPDATE')
    expect(statements[1].bindings).toEqual([
      'user-1', 120, 0, 125, OUTBOUND_MINUTE_LIMIT, OUTBOUND_DAY_LIMIT,
    ])
  })

  it('uses per-user overrides and skips counting when globally disabled', async () => {
    const override = database(1, undefined, {
      outbound_minute_limit: 4,
      outbound_day_limit: 25,
      enabled: '1',
      minute_limit: '10',
      day_limit: '200',
    })
    await claimOutboundSend(override.db, 'user-1', 125)
    expect(override.statements[1].bindings.slice(-2)).toEqual([4, 25])

    const disabled = database(1, undefined, {
      outbound_minute_limit: null,
      outbound_day_limit: null,
      enabled: '0',
      minute_limit: '10',
      day_limit: '200',
    })
    await expect(claimOutboundSend(disabled.db, 'user-1', 125))
      .resolves.toEqual({ allowed: true })
    expect(disabled.statements).toHaveLength(1)
  })

  it('enforces a provider hard cap even when the global limiter is disabled', async () => {
    const capped = database(1, undefined, {
      outbound_minute_limit: null,
      outbound_day_limit: null,
      enabled: '0',
      minute_limit: '10',
      day_limit: '200',
    })

    await expect(claimOutboundSend(capped.db, 'user-1', 125, { dayLimit: 50 }))
      .resolves.toEqual({ allowed: true })
    expect(capped.statements[1].bindings.slice(-2)).toEqual([10, 50])
  })

  it('returns the remaining minute window after the short limit is reached', async () => {
    const { db } = database(0, {
      minute_started_at: 120,
      minute_count: OUTBOUND_MINUTE_LIMIT,
      day_started_at: 0,
      day_count: 20,
    })

    await expect(claimOutboundSend(db, 'user-1', 125)).resolves.toEqual({
      allowed: false,
      retryAfter: 55,
    })
  })

  it('returns the remaining UTC day after the daily limit is reached', async () => {
    const now = 86_500
    const { db } = database(0, {
      minute_started_at: 86_460,
      minute_count: 1,
      day_started_at: 86_400,
      day_count: OUTBOUND_DAY_LIMIT,
    })

    await expect(claimOutboundSend(db, 'user-1', now)).resolves.toEqual({
      allowed: false,
      retryAfter: 86_300,
    })
  })

  it('reports only usage from the current windows', () => {
    expect(outboundRateLimitState(
      { enabled: true, minuteLimit: 10, dayLimit: 200 },
      { minuteLimit: null, dayLimit: 300 },
      { minuteStartedAt: 60, minuteCount: 8, dayStartedAt: 0, dayCount: 50 },
      125,
    )).toMatchObject({
      minuteLimit: 10,
      dayLimit: 300,
      minuteUsed: 0,
      dayUsed: 50,
      minuteResetsAt: 180,
      dayResetsAt: 86_400,
    })
  })
})
