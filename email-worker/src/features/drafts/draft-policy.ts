import type { UserRole } from '../../app/types'

export const DRAFT_LIMIT_SETTINGS = {
  superAdmin: 'draft_limit_super_admin',
  admin: 'draft_limit_admin',
  user: 'draft_limit_user',
  temporary: 'draft_limit_temporary',
} as const

export const DEFAULT_DRAFT_LIMIT = 5
export const MIN_DRAFT_LIMIT = 1
export const MAX_DRAFT_LIMIT = 20

export type DraftLimits = {
  superAdmin: number
  admin: number
  user: number
  temporary: number
}

function configuredLimit(value: string | undefined): number {
  const limit = Number(value)
  return Number.isInteger(limit) && limit >= MIN_DRAFT_LIMIT && limit <= MAX_DRAFT_LIMIT
    ? limit
    : DEFAULT_DRAFT_LIMIT
}

export function draftLimitsFromSettings(settings: ReadonlyMap<string, string>): DraftLimits {
  return {
    superAdmin: configuredLimit(settings.get(DRAFT_LIMIT_SETTINGS.superAdmin)),
    admin: configuredLimit(settings.get(DRAFT_LIMIT_SETTINGS.admin)),
    user: configuredLimit(settings.get(DRAFT_LIMIT_SETTINGS.user)),
    temporary: configuredLimit(settings.get(DRAFT_LIMIT_SETTINGS.temporary)),
  }
}

export function validDraftLimits(value: unknown): value is DraftLimits {
  if (!value || typeof value !== 'object') return false
  const limits = value as Record<string, unknown>
  return ['superAdmin', 'admin', 'user', 'temporary'].every((key) => (
    typeof limits[key] === 'number'
    && Number.isInteger(limits[key])
    && limits[key] >= MIN_DRAFT_LIMIT
    && limits[key] <= MAX_DRAFT_LIMIT
  ))
}

export function draftLimitForRole(limits: DraftLimits, role: UserRole): number {
  if (role === 'super_admin') return limits.superAdmin
  if (role === 'admin') return limits.admin
  if (role === 'temporary') return limits.temporary
  return limits.user
}

export async function configuredDraftLimits(db: D1Database): Promise<DraftLimits> {
  const keys = Object.values(DRAFT_LIMIT_SETTINGS)
  const { results } = await db.prepare(
    `SELECT key, value FROM settings
      WHERE key IN (${keys.map(() => '?').join(', ')})`,
  ).bind(...keys).all<{ key: string; value: string }>()
  return draftLimitsFromSettings(new Map(results.map((row) => [row.key, row.value])))
}
