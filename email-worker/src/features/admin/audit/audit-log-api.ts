import { pageResult, parsePageRequest } from '../../../shared/http/pagination'
import type { Env, SessionUser } from '../../../app/types'

const CATEGORIES = [
  'all',
  'auth',
  'account',
  'user',
  'mailbox',
  'domain',
  'invitation',
  'message',
  'icloud',
  'gmail',
  'microsoft',
  'qq-mail',
  'linuxdo-mail',
  'system',
] as const

export type AuditCategory = typeof CATEGORIES[number]
export type AuditDays = 1 | 7 | 30 | 90

interface AuditRow {
  id: number
  user_id: string | null
  actor_email: string | null
  actor_name: string | null
  actor_role: string | null
  target_email: string | null
  target_name: string | null
  action: string
  target_id: string | null
  ip: string | null
  detail_json: string
  created_at: number
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function isAdministrator(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin'
}

export function auditDays(value: string | null): AuditDays {
  const parsed = Number(value)
  return parsed === 1 || parsed === 30 || parsed === 90 ? parsed : 7
}

export function auditCategory(value: string | null): AuditCategory {
  return CATEGORIES.includes(value as AuditCategory) ? value as AuditCategory : 'all'
}

export function auditCategoryCondition(category: AuditCategory): string {
  if (category === 'all') return ''
  if (category === 'invitation') return "a.action LIKE 'temporary_invite.%'"
  if (category === 'system') return "a.action LIKE 'setup.%'"
  if (category === 'linuxdo-mail') return "a.action LIKE 'linuxdo_mail.%'"
  if (category === 'qq-mail') return "a.action LIKE 'qq_mail.%'"
  return `a.action LIKE '${category}.%'`
}

function detail(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export async function listAuditLogs(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  if (!isAdministrator(user)) {
    return json({ error: '只有管理员可以查看操作日志。' }, 403)
  }
  const pagination = parsePageRequest(request, 2, 50)
  if (!pagination) {
    return json({ error: '分页参数无效，limit 需要在 1–100 之间。' }, 400)
  }

  const params = new URL(request.url).searchParams
  const days = auditDays(params.get('days'))
  const category = auditCategory(params.get('category'))
  const query = (params.get('q') || '').trim().slice(0, 120)
  const now = Math.floor(Date.now() / 1000)
  const conditions = ['a.created_at >= ?']
  const bindings: Array<string | number> = [now - days * 86400]
  const scoped = auditCategoryCondition(category)
  if (scoped) conditions.push(scoped)
  if (query) {
    const escaped = query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
    const pattern = `%${escaped}%`
    conditions.push(`(
      a.action LIKE ? ESCAPE '\\' OR
      COALESCE(a.target_id, '') LIKE ? ESCAPE '\\' OR
      COALESCE(a.ip, '') LIKE ? ESCAPE '\\' OR
      COALESCE(u.email, '') LIKE ? ESCAPE '\\' OR
      COALESCE(u.display_name, '') LIKE ? ESCAPE '\\' OR
      COALESCE(tu.email, '') LIKE ? ESCAPE '\\' OR
      COALESCE(tu.display_name, '') LIKE ? ESCAPE '\\' OR
      COALESCE(ia.name, '') LIKE ? ESCAPE '\\' OR
      COALESCE(ia.icloud_email, '') LIKE ? ESCAPE '\\' OR
      COALESCE(qa.name, '') LIKE ? ESCAPE '\\' OR
      COALESCE(qa.email, '') LIKE ? ESCAPE '\\' OR
      COALESCE(qi.name, '') LIKE ? ESCAPE '\\' OR
      COALESCE(qi.email, '') LIKE ? ESCAPE '\\' OR
      COALESCE(a.detail_json, '') LIKE ? ESCAPE '\\'
    )`)
    bindings.push(
      pattern, pattern, pattern, pattern, pattern, pattern,
      pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern,
    )
  }
  const summaryConditions = [...conditions]
  const summaryBindings = [...bindings]

  if (pagination.cursor) {
    const [createdAt, id] = pagination.cursor.values
    if (
      typeof createdAt !== 'number'
      || !Number.isSafeInteger(createdAt)
      || createdAt < 0
      || typeof id !== 'number'
      || !Number.isSafeInteger(id)
      || id < 1
    ) return json({ error: '日志分页游标无效。' }, 400)
    conditions.push('(a.created_at < ? OR (a.created_at = ? AND a.id < ?))')
    bindings.push(createdAt, createdAt, id)
  }

  const { results } = await env.DB.prepare(
    `SELECT a.id, a.user_id, u.email AS actor_email,
            u.display_name AS actor_name, u.role AS actor_role,
            COALESCE(tu.email, NULLIF(ia.icloud_email, ''), NULLIF(ia.real_email, '')) AS target_email,
            COALESCE(tu.display_name, ia.name, qa.name, qi.name) AS target_name,
            a.action, a.target_id, a.ip, a.detail_json, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN users tu ON tu.id = a.target_id
       LEFT JOIN icloud_accounts ia ON ia.id = a.target_id
       LEFT JOIN qq_mail_accounts qa ON qa.id = a.target_id
       LEFT JOIN qq_mail_identities qi ON qi.id = a.target_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ?`,
  ).bind(...bindings, pagination.limit + 1).all<AuditRow>()
  const result = pageResult(
    results,
    pagination.limit,
    (row) => [row.created_at, row.id],
  )

  const summary = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN a.action IN ('auth.login', 'auth.token.issue')
                     THEN 1 ELSE 0 END) AS login_success,
            SUM(CASE WHEN a.action = 'auth.login_failed'
                     THEN 1 ELSE 0 END) AS login_failed
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN users tu ON tu.id = a.target_id
       LEFT JOIN icloud_accounts ia ON ia.id = a.target_id
       LEFT JOIN qq_mail_accounts qa ON qa.id = a.target_id
       LEFT JOIN qq_mail_identities qi ON qi.id = a.target_id
      WHERE ${summaryConditions.join(' AND ')}`,
  ).bind(...summaryBindings).first<{
    total: number
    login_success: number | null
    login_failed: number | null
  }>()

  return json({
    logs: result.items.map((row) => ({
      id: row.id,
      actor: row.user_id ? {
        id: row.user_id,
        email: row.actor_email,
        displayName: row.actor_name,
        role: row.actor_role,
      } : null,
      action: row.action,
      targetId: row.target_id,
      target: row.target_email || row.target_name ? {
        id: row.target_id,
        email: row.target_email,
        displayName: row.target_name,
      } : null,
      ip: row.ip || 'unknown',
      detail: detail(row.detail_json),
      createdAt: row.created_at,
    })),
    page: result.page,
    summary: {
      total: summary?.total ?? 0,
      loginSuccess: summary?.login_success ?? 0,
      loginFailed: summary?.login_failed ?? 0,
    },
  })
}
