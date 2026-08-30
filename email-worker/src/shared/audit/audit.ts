import type { Env } from '../../app/types'

const SENSITIVE_KEY = /password|token|secret|authorization|cookie/i

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return value.slice(0, 500)
  if (Array.isArray(value)) return value.slice(0, 50).map(redactValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, child]) => [key, redactValue(child)]),
  )
}

export function redactAuditDetail(
  detail: Record<string, unknown>,
): Record<string, unknown> {
  return redactValue(detail) as Record<string, unknown>
}

export async function writeAudit(
  env: Env,
  userId: string | null,
  action: string,
  targetId: string | null,
  ip: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (user_id, action, target_id, ip, detail_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(
    userId,
    action.slice(0, 80),
    targetId?.slice(0, 254) || null,
    ip.slice(0, 128),
    JSON.stringify(redactAuditDetail(detail)),
  ).run()
}
