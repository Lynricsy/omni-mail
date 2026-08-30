import { writeAudit } from '../../shared/audit/audit'
import {
  OUTBOUND_DAY_LIMIT_MAX,
  OUTBOUND_MINUTE_LIMIT_MAX,
  outboundRateLimitSettings,
  readOutboundRateLimitState,
  type OutboundRateLimitSettings,
} from './outbound-rate-limit'
import { canEditManagedUser } from '../admin/users/user-admin-api'
import type { Env, SessionUser, UserRole } from '../../app/types'

type OverrideInput = {
  minuteLimit?: unknown
  dayLimit?: unknown
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function isAdministrator(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin'
}

function validLimit(value: unknown, maximum: number): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 1
    && value <= maximum
}

export function parseOutboundRateLimitSettings(
  input: Record<string, unknown>,
): OutboundRateLimitSettings | null {
  return typeof input.enabled === 'boolean'
    && validLimit(input.minuteLimit, OUTBOUND_MINUTE_LIMIT_MAX)
    && validLimit(input.dayLimit, OUTBOUND_DAY_LIMIT_MAX)
    ? {
        enabled: input.enabled,
        minuteLimit: input.minuteLimit,
        dayLimit: input.dayLimit,
      }
    : null
}

export function parseOutboundRateLimitOverride(input: OverrideInput): {
  minuteLimit: number | null
  dayLimit: number | null
} | null {
  const minuteValid = input.minuteLimit === null
    || validLimit(input.minuteLimit, OUTBOUND_MINUTE_LIMIT_MAX)
  const dayValid = input.dayLimit === null
    || validLimit(input.dayLimit, OUTBOUND_DAY_LIMIT_MAX)
  if (!minuteValid || !dayValid) return null
  return {
    minuteLimit: input.minuteLimit as number | null,
    dayLimit: input.dayLimit as number | null,
  }
}

export async function getOutboundRateLimitSettings(
  env: Env,
  actor: SessionUser,
): Promise<Response> {
  if (!isAdministrator(actor)) {
    return json({ error: '只有管理员可以查看发信限速设置。' }, 403)
  }
  return json({ outboundRateLimit: await outboundRateLimitSettings(env.DB) })
}

export async function updateOutboundRateLimitSettings(
  env: Env,
  actor: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) {
    return json({ error: '只有管理员可以修改发信限速设置。' }, 403)
  }
  const input = await request.json<Record<string, unknown>>()
    .catch(() => ({} as Record<string, unknown>))
  const settings = parseOutboundRateLimitSettings(input)
  if (!settings) return json({ error: '发信限速设置无效。' }, 400)
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind('outbound_rate_limit_enabled', settings.enabled ? '1' : '0'),
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind('outbound_rate_limit_minute', String(settings.minuteLimit)),
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind('outbound_rate_limit_day', String(settings.dayLimit)),
  ])
  await writeAudit(env, actor.id, 'system.outbound_rate_limit.update', null, ip, settings)
  return json({ outboundRateLimit: settings })
}

type ManagedTarget = {
  id: string
  email: string
  role: UserRole
  outbound_minute_limit: number | null
  outbound_day_limit: number | null
}

async function editableTarget(
  env: Env,
  actor: SessionUser,
  configuredEmail: string,
  targetId: string,
): Promise<ManagedTarget | Response> {
  const target = await env.DB.prepare(
    `SELECT id, email, role, outbound_minute_limit, outbound_day_limit
       FROM users WHERE id = ? AND deleted_at IS NULL`,
  ).bind(targetId).first<ManagedTarget>()
  if (!target) return json({ error: '用户不存在。' }, 404)
  const targetRole: UserRole = target.email.toLowerCase() === configuredEmail.trim().toLowerCase()
    ? 'super_admin'
    : target.role
  if (!canEditManagedUser(
    actor.role,
    targetRole,
    actor.id === target.id,
    targetRole === 'super_admin',
  )) return json({ error: '不能修改这个账户。' }, 403)
  return target
}

export async function updateUserOutboundRateLimit(
  env: Env,
  actor: SessionUser,
  configuredEmail: string,
  targetId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) return json({ error: '只有管理员可以设置用户。' }, 403)
  const target = await editableTarget(env, actor, configuredEmail, targetId)
  if (target instanceof Response) return target
  const input = await request.json<OverrideInput>().catch(() => ({} as OverrideInput))
  const override = parseOutboundRateLimitOverride(input)
  if (!override) return json({ error: '用户发信限速设置无效。' }, 400)
  await env.DB.prepare(
    `UPDATE users SET outbound_minute_limit = ?, outbound_day_limit = ?,
        updated_at = unixepoch() WHERE id = ?`,
  ).bind(override.minuteLimit, override.dayLimit, target.id).run()
  await writeAudit(env, actor.id, 'user.outbound_rate_limit.update', target.id, ip, {
    previousMinuteLimit: target.outbound_minute_limit,
    previousDayLimit: target.outbound_day_limit,
    ...override,
  })
  return json({ outboundRateLimit: await readOutboundRateLimitState(env.DB, target.id) })
}

export async function resetUserOutboundRateLimit(
  env: Env,
  actor: SessionUser,
  configuredEmail: string,
  targetId: string,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) return json({ error: '只有管理员可以设置用户。' }, 403)
  const target = await editableTarget(env, actor, configuredEmail, targetId)
  if (target instanceof Response) return target
  await env.DB.prepare('DELETE FROM outbound_rate_limits WHERE user_id = ?').bind(target.id).run()
  await writeAudit(env, actor.id, 'user.outbound_rate_limit.reset', target.id, ip)
  return json({ outboundRateLimit: await readOutboundRateLimitState(env.DB, target.id) })
}
