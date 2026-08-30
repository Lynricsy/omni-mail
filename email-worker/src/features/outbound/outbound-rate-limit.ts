export const OUTBOUND_MINUTE_LIMIT = 10
export const OUTBOUND_DAY_LIMIT = 200
export const OUTBOUND_MINUTE_LIMIT_MAX = 100
export const OUTBOUND_DAY_LIMIT_MAX = 10_000

const ENABLED_SETTING = 'outbound_rate_limit_enabled'
const MINUTE_SETTING = 'outbound_rate_limit_minute'
const DAY_SETTING = 'outbound_rate_limit_day'

export type OutboundRateLimitSettings = {
  enabled: boolean
  minuteLimit: number
  dayLimit: number
}

export type OutboundRateLimitState = OutboundRateLimitSettings & {
  minuteLimitOverride: number | null
  dayLimitOverride: number | null
  minuteUsed: number
  dayUsed: number
  minuteResetsAt: number
  dayResetsAt: number
}

export type OutboundRateLimitOverride = {
  minuteLimit: number | null
  dayLimit: number | null
}

type OutboundRateLimitPolicy = OutboundRateLimitSettings & {
  minuteLimitOverride: number | null
  dayLimitOverride: number | null
}

export type OutboundRateLimitWindow = {
  minuteStartedAt: number | null
  minuteCount: number | null
  dayStartedAt: number | null
  dayCount: number | null
}

type OutboundRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number }

type PolicyRow = {
  outbound_minute_limit: number | null
  outbound_day_limit: number | null
  enabled: string
  minute_limit: string
  day_limit: string
}

type WindowRow = {
  minute_started_at: number
  minute_count: number
  day_started_at: number
  day_count: number
}

function limit(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback
}

export async function outboundRateLimitSettings(
  db: D1Database,
): Promise<OutboundRateLimitSettings> {
  const { results } = await db.prepare(
    `SELECT key, value FROM settings WHERE key IN (?, ?, ?)`,
  ).bind(ENABLED_SETTING, MINUTE_SETTING, DAY_SETTING).all<{ key: string; value: string }>()
  const settings = new Map(results.map((row) => [row.key, row.value]))
  return {
    enabled: settings.get(ENABLED_SETTING) !== '0',
    minuteLimit: limit(
      settings.get(MINUTE_SETTING),
      OUTBOUND_MINUTE_LIMIT,
      OUTBOUND_MINUTE_LIMIT_MAX,
    ),
    dayLimit: limit(
      settings.get(DAY_SETTING),
      OUTBOUND_DAY_LIMIT,
      OUTBOUND_DAY_LIMIT_MAX,
    ),
  }
}

async function outboundRateLimitPolicy(
  db: D1Database,
  userId: string,
): Promise<OutboundRateLimitPolicy> {
  const row = await db.prepare(
    `SELECT u.outbound_minute_limit, u.outbound_day_limit,
            COALESCE((SELECT value FROM settings WHERE key = ?), '1') AS enabled,
            COALESCE((SELECT value FROM settings WHERE key = ?), ?) AS minute_limit,
            COALESCE((SELECT value FROM settings WHERE key = ?), ?) AS day_limit
       FROM users u WHERE u.id = ?`,
  ).bind(
    ENABLED_SETTING,
    MINUTE_SETTING,
    String(OUTBOUND_MINUTE_LIMIT),
    DAY_SETTING,
    String(OUTBOUND_DAY_LIMIT),
    userId,
  ).first<PolicyRow>()
  const minuteLimit = limit(
    row?.minute_limit,
    OUTBOUND_MINUTE_LIMIT,
    OUTBOUND_MINUTE_LIMIT_MAX,
  )
  const dayLimit = limit(row?.day_limit, OUTBOUND_DAY_LIMIT, OUTBOUND_DAY_LIMIT_MAX)
  const minuteLimitOverride = row?.outbound_minute_limit == null
    ? null
    : limit(row.outbound_minute_limit, minuteLimit, OUTBOUND_MINUTE_LIMIT_MAX)
  const dayLimitOverride = row?.outbound_day_limit == null
    ? null
    : limit(row.outbound_day_limit, dayLimit, OUTBOUND_DAY_LIMIT_MAX)
  return {
    enabled: row?.enabled !== '0',
    minuteLimit: minuteLimitOverride ?? minuteLimit,
    dayLimit: dayLimitOverride ?? dayLimit,
    minuteLimitOverride,
    dayLimitOverride,
  }
}

export function outboundRateLimitState(
  settings: OutboundRateLimitSettings,
  override: OutboundRateLimitOverride,
  window: OutboundRateLimitWindow,
  now = Math.floor(Date.now() / 1000),
): OutboundRateLimitState {
  const minuteStartedAt = Math.floor(now / 60) * 60
  const dayStartedAt = Math.floor(now / 86_400) * 86_400
  return {
    enabled: settings.enabled,
    minuteLimit: override.minuteLimit ?? settings.minuteLimit,
    dayLimit: override.dayLimit ?? settings.dayLimit,
    minuteLimitOverride: override.minuteLimit,
    dayLimitOverride: override.dayLimit,
    minuteUsed: window.minuteStartedAt === minuteStartedAt ? window.minuteCount ?? 0 : 0,
    dayUsed: window.dayStartedAt === dayStartedAt ? window.dayCount ?? 0 : 0,
    minuteResetsAt: minuteStartedAt + 60,
    dayResetsAt: dayStartedAt + 86_400,
  }
}

export async function readOutboundRateLimitState(
  db: D1Database,
  userId: string,
  now = Math.floor(Date.now() / 1000),
): Promise<OutboundRateLimitState> {
  const policy = await outboundRateLimitPolicy(db, userId)
  const row = await db.prepare(
    `SELECT minute_started_at, minute_count, day_started_at, day_count
       FROM outbound_rate_limits WHERE user_id = ?`,
  ).bind(userId).first<WindowRow>()
  return outboundRateLimitState(
    policy,
    {
      minuteLimit: policy.minuteLimitOverride,
      dayLimit: policy.dayLimitOverride,
    },
    {
      minuteStartedAt: row?.minute_started_at ?? null,
      minuteCount: row?.minute_count ?? null,
      dayStartedAt: row?.day_started_at ?? null,
      dayCount: row?.day_count ?? null,
    },
    now,
  )
}

export async function claimOutboundSend(
  db: D1Database,
  userId: string,
  now = Math.floor(Date.now() / 1000),
  maximums?: { minuteLimit?: number; dayLimit?: number },
): Promise<OutboundRateLimitResult> {
  const configured = await outboundRateLimitPolicy(db, userId)
  const policy = maximums ? {
    ...configured,
    enabled: true,
    minuteLimit: Math.min(configured.minuteLimit, maximums.minuteLimit ?? Infinity),
    dayLimit: Math.min(configured.dayLimit, maximums.dayLimit ?? Infinity),
  } : configured
  if (!policy.enabled) return { allowed: true }
  const minuteStartedAt = Math.floor(now / 60) * 60
  const dayStartedAt = Math.floor(now / 86_400) * 86_400
  const result = await db.prepare(
    `INSERT INTO outbound_rate_limits (
       user_id, minute_started_at, minute_count, day_started_at, day_count, updated_at
     ) VALUES (?, ?, 1, ?, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       minute_started_at = excluded.minute_started_at,
       minute_count = CASE
         WHEN outbound_rate_limits.minute_started_at = excluded.minute_started_at
           THEN outbound_rate_limits.minute_count + 1
         ELSE 1
       END,
       day_started_at = excluded.day_started_at,
       day_count = CASE
         WHEN outbound_rate_limits.day_started_at = excluded.day_started_at
           THEN outbound_rate_limits.day_count + 1
         ELSE 1
       END,
       updated_at = excluded.updated_at
     WHERE (
       outbound_rate_limits.minute_started_at != excluded.minute_started_at
       OR outbound_rate_limits.minute_count < ?
     ) AND (
       outbound_rate_limits.day_started_at != excluded.day_started_at
       OR outbound_rate_limits.day_count < ?
     )`,
  ).bind(
    userId,
    minuteStartedAt,
    dayStartedAt,
    now,
    policy.minuteLimit,
    policy.dayLimit,
  ).run()
  if (result.meta.changes) return { allowed: true }

  const row = await db.prepare(
    `SELECT minute_started_at, minute_count, day_started_at, day_count
       FROM outbound_rate_limits WHERE user_id = ?`,
  ).bind(userId).first<WindowRow>()
  const retryAt = Math.max(
    row?.minute_started_at === minuteStartedAt && row.minute_count >= policy.minuteLimit
      ? minuteStartedAt + 60
      : now + 1,
    row?.day_started_at === dayStartedAt && row.day_count >= policy.dayLimit
      ? dayStartedAt + 86_400
      : now + 1,
  )
  return { allowed: false, retryAfter: Math.max(1, retryAt - now) }
}
