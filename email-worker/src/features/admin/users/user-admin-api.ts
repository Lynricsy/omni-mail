import { hashPassword, validatePassword } from '../../auth/session/auth'
import { normalizeEmail, validEmail } from '../../../shared/http/api-helpers'
import {
  outboundRateLimitSettings,
  outboundRateLimitState,
  type OutboundRateLimitSettings,
} from '../../outbound/outbound-rate-limit'
import { pageResult, parsePageRequest } from '../../../shared/http/pagination'
import type { Env, SessionUser, UserRole, UserRow } from '../../../app/types'

type AccountStatus = 'active' | 'disabled'
type EditableRole = Exclude<UserRole, 'super_admin'>

interface AdminUserRow extends UserRow {
  updated_at: number
  mailbox_count: number
  minute_started_at: number | null
  minute_count: number | null
  day_started_at: number | null
  day_count: number | null
}

interface RankedAdminUserRow extends AdminUserRow {
  sort_role: number
}

interface UserPolicyInput {
  role?: EditableRole
  status?: AccountStatus
  mailboxLimit?: number
  storageQuotaMiB?: number
  canCreateMailboxes?: boolean
  canReply?: boolean
  canTranslate?: boolean
}

interface CreateUserInput extends UserPolicyInput {
  email?: string
  displayName?: string
  password?: string
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function isAdministrator(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin'
}

function isConfiguredSuperAdmin(email: string, configuredEmail: string): boolean {
  return email.toLowerCase() === configuredEmail.trim().toLowerCase()
}

export function canEditManagedUser(
  actorRole: UserRole,
  targetRole: UserRole,
  isSelf: boolean,
  isSuperAdminTarget: boolean,
): boolean {
  if (isSelf || isSuperAdminTarget) return false
  if (actorRole === 'super_admin') return true
  return actorRole === 'admin' && targetRole !== 'admin' && targetRole !== 'super_admin'
}

export function canAssignManagedRole(actorRole: UserRole, nextRole: UserRole): boolean {
  if (nextRole === 'super_admin') return false
  return actorRole === 'super_admin' || nextRole === 'user' || nextRole === 'temporary'
}

function validPolicy(input: UserPolicyInput): input is Required<UserPolicyInput> {
  return (
    ['admin', 'user', 'temporary'].includes(input.role || '')
    && ['active', 'disabled'].includes(input.status || '')
    && Number.isInteger(input.mailboxLimit)
    && Number(input.mailboxLimit) >= 0
    && Number(input.mailboxLimit) <= 100
    && Number.isInteger(input.storageQuotaMiB)
    && (
      Number(input.storageQuotaMiB) === 0
      || (Number(input.storageQuotaMiB) >= 16 && Number(input.storageQuotaMiB) <= 102400)
    )
    && typeof input.canCreateMailboxes === 'boolean'
    && typeof input.canReply === 'boolean'
    && typeof input.canTranslate === 'boolean'
  )
}

function userJson(
  row: AdminUserRow,
  configuredEmail: string,
  rateSettings: OutboundRateLimitSettings,
  now: number,
) {
  const superAdmin = isConfiguredSuperAdmin(row.email, configuredEmail)
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: superAdmin ? 'super_admin' as const : row.role,
    status: row.status,
    mailboxLimit: row.mailbox_limit,
    mailboxCount: row.mailbox_count,
    storageQuotaBytes: row.storage_quota_bytes,
    storageUsedBytes: row.storage_used_bytes,
    canCreateMailboxes: superAdmin || row.role === 'admin' || Boolean(row.can_create_mailboxes),
    canReply: superAdmin || Boolean(row.can_reply),
    canTranslate: superAdmin || row.role === 'admin' || Boolean(row.can_translate),
    outboundRateLimit: outboundRateLimitState(
      rateSettings,
      {
        minuteLimit: row.outbound_minute_limit,
        dayLimit: row.outbound_day_limit,
      },
      {
        minuteStartedAt: row.minute_started_at,
        minuteCount: row.minute_count,
        dayStartedAt: row.day_started_at,
        dayCount: row.day_count,
      },
      now,
    ),
    temporaryExpiresAt: row.temporary_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function audit(
  env: Env,
  actorId: string,
  action: string,
  targetId: string,
  ip: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (user_id, action, target_id, ip, detail_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(actorId, action, targetId, ip, JSON.stringify(detail)).run()
}

async function findUser(env: Env, id: string): Promise<AdminUserRow | null> {
  return env.DB.prepare(
    `SELECT u.*, COUNT(m.address) AS mailbox_count,
            rl.minute_started_at, rl.minute_count, rl.day_started_at, rl.day_count
       FROM users u
       LEFT JOIN mailboxes m ON m.user_id = u.id AND m.is_hidden = 0
       LEFT JOIN outbound_rate_limits rl ON rl.user_id = u.id
      WHERE u.id = ? AND u.deleted_at IS NULL
      GROUP BY u.id`,
  ).bind(id).first<AdminUserRow>()
}

export async function listManagedUsers(
  env: Env,
  actor: SessionUser,
  configuredEmail: string,
  request: Request,
): Promise<Response> {
  if (!isAdministrator(actor)) return json({ error: '只有管理员可以查看用户。' }, 403)
  const now = Math.floor(Date.now() / 1000)
  const rateSettings = await outboundRateLimitSettings(env.DB)
  const pagination = parsePageRequest(request, 3, 50)
  if (!pagination) return json({ error: '分页参数无效，limit 需要在 1–100 之间。' }, 400)
  const bindings: Array<string | number> = [configuredEmail]
  let cursorWhere = ''
  if (pagination.cursor) {
    const [roleRank, createdAt, id] = pagination.cursor.values
    if (
      typeof roleRank !== 'number'
      || !Number.isInteger(roleRank)
      || roleRank < 0
      || roleRank > 3
      || typeof createdAt !== 'number'
      || !Number.isSafeInteger(createdAt)
      || createdAt < 0
      || typeof id !== 'string'
      || !id
      || id.length > 100
    ) return json({ error: '用户分页游标无效。' }, 400)
    cursorWhere = `WHERE (
      sort_role > ? OR
      (sort_role = ? AND created_at > ?) OR
      (sort_role = ? AND created_at = ? AND id > ?)
    )`
    bindings.push(roleRank, roleRank, createdAt, roleRank, createdAt, id)
  }
  const { results } = await env.DB.prepare(
    `SELECT * FROM (
       SELECT u.*, COUNT(m.address) AS mailbox_count,
              rl.minute_started_at, rl.minute_count, rl.day_started_at, rl.day_count,
              CASE
                WHEN lower(u.email) = lower(?) THEN 0
                WHEN u.role = 'admin' THEN 1
                WHEN u.role = 'user' THEN 2
                ELSE 3
              END AS sort_role
         FROM users u
         LEFT JOIN mailboxes m ON m.user_id = u.id AND m.is_hidden = 0
         LEFT JOIN outbound_rate_limits rl ON rl.user_id = u.id
        WHERE u.deleted_at IS NULL
        GROUP BY u.id
     ) ranked
     ${cursorWhere}
     ORDER BY sort_role, created_at, id
     LIMIT ?`,
  ).bind(...bindings, pagination.limit + 1).all<RankedAdminUserRow>()
  const result = pageResult(
    results,
    pagination.limit,
    (row) => [row.sort_role, row.created_at, row.id],
  )
  const totals = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled
       FROM users WHERE deleted_at IS NULL`,
  ).first<{ total: number; active: number | null; disabled: number | null }>()
  return json({
    users: result.items.map((row) => userJson(row, configuredEmail, rateSettings, now)),
    page: result.page,
    totals: {
      total: totals?.total ?? 0,
      active: totals?.active ?? 0,
      disabled: totals?.disabled ?? 0,
    },
  })
}

export async function createManagedUser(
  env: Env,
  actor: SessionUser,
  configuredEmail: string,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) return json({ error: '只有管理员可以创建用户。' }, 403)
  const body = await request.json<CreateUserInput>().catch(() => ({} as CreateUserInput))
  const email = normalizeEmail(body.email || '')
  const displayName = (body.displayName || '').trim()
  const password = body.password || ''
  const policy: UserPolicyInput = {
    role: body.role,
    status: 'active',
    mailboxLimit: body.mailboxLimit,
    storageQuotaMiB: body.storageQuotaMiB,
    canCreateMailboxes: body.role === 'admin' ? true : body.canCreateMailboxes,
    canReply: body.canReply,
    canTranslate: body.role === 'admin' ? true : body.canTranslate,
  }

  if (!validEmail(email)) return json({ error: '请输入有效的登录邮箱。' }, 400)
  if (isConfiguredSuperAdmin(email, configuredEmail)) {
    return json({ error: '这个邮箱已经由 Worker 配置为主管理员。' }, 409)
  }
  if (!displayName || displayName.length > 60) {
    return json({ error: '显示名称需要在 1–60 个字符之间。' }, 400)
  }
  const passwordError = validatePassword(password)
  if (passwordError) return json({ error: passwordError }, 400)
  if (!validPolicy(policy)) return json({ error: '用户权限配置无效。' }, 400)
  if (!canAssignManagedRole(actor.role, policy.role)) {
    return json({ error: '只有主管理员可以授予管理员角色。' }, 403)
  }

  const id = crypto.randomUUID()
  try {
    await env.DB.prepare(
      `INSERT INTO users (
        id, email, display_name, password_hash, role, status, mailbox_limit,
        storage_quota_bytes, can_create_mailboxes, can_reply, can_translate
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      email,
      displayName,
      await hashPassword(password),
      policy.role,
      policy.mailboxLimit,
      Number(policy.storageQuotaMiB) * 1024 * 1024,
      Number(policy.canCreateMailboxes),
      Number(policy.canReply),
      Number(policy.canTranslate),
    ).run()
  } catch {
    return json({ error: '创建失败，这个登录邮箱可能已经存在。' }, 409)
  }

  await audit(env, actor.id, 'user.create', id, ip, {
    email,
    role: policy.role,
    mailboxLimit: policy.mailboxLimit,
    storageQuotaMiB: policy.storageQuotaMiB,
    canCreateMailboxes: policy.canCreateMailboxes,
    canReply: policy.canReply,
    canTranslate: policy.canTranslate,
  })
  const created = await findUser(env, id)
  const rateSettings = await outboundRateLimitSettings(env.DB)
  return json({
    user: created
      ? userJson(created, configuredEmail, rateSettings, Math.floor(Date.now() / 1000))
      : null,
  }, 201)
}

export async function updateManagedUser(
  env: Env,
  actor: SessionUser,
  configuredEmail: string,
  targetId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) return json({ error: '只有管理员可以设置用户。' }, 403)
  const target = await findUser(env, targetId)
  if (!target) return json({ error: '用户不存在。' }, 404)

  const targetRole = isConfiguredSuperAdmin(target.email, configuredEmail)
    ? 'super_admin'
    : target.role
  if (!canEditManagedUser(
    actor.role,
    targetRole,
    actor.id === target.id,
    targetRole === 'super_admin',
  )) {
    return json({ error: '不能修改这个账户。' }, 403)
  }

  const input = await request.json<UserPolicyInput>().catch(() => ({} as UserPolicyInput))
  const policy: UserPolicyInput = {
    ...input,
    canCreateMailboxes: input.role === 'admin' ? true : input.canCreateMailboxes,
    canTranslate: input.role === 'admin' ? true : input.canTranslate,
  }
  if (!validPolicy(policy)) return json({ error: '用户权限配置无效。' }, 400)
  if (!canAssignManagedRole(actor.role, policy.role)) {
    return json({ error: '只有主管理员可以授予管理员角色。' }, 403)
  }

  await env.DB.prepare(
    `UPDATE users
        SET role = ?, status = ?, mailbox_limit = ?, storage_quota_bytes = ?,
            can_create_mailboxes = ?, can_reply = ?, can_translate = ?,
            updated_at = unixepoch()
      WHERE id = ?`,
  ).bind(
    policy.role,
    policy.status,
    policy.mailboxLimit,
    Number(policy.storageQuotaMiB) * 1024 * 1024,
    Number(policy.canCreateMailboxes),
    Number(policy.canReply),
    Number(policy.canTranslate),
    target.id,
  ).run()
  if (policy.status === 'disabled') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
      env.DB.prepare(
        `UPDATE device_sessions SET revoked_at = COALESCE(revoked_at, unixepoch())
          WHERE user_id = ?`,
      ).bind(target.id),
    ])
  }
  await audit(env, actor.id, 'user.update', target.id, ip, {
    previousRole: targetRole,
    role: policy.role,
    status: policy.status,
    mailboxLimit: policy.mailboxLimit,
    storageQuotaMiB: policy.storageQuotaMiB,
    canCreateMailboxes: policy.canCreateMailboxes,
    canReply: policy.canReply,
    previousCanTranslate: targetRole === 'admin' || targetRole === 'super_admin'
      || Boolean(target.can_translate),
    canTranslate: policy.canTranslate,
  })

  const updated = await findUser(env, target.id)
  const rateSettings = await outboundRateLimitSettings(env.DB)
  return json({
    user: updated
      ? userJson(updated, configuredEmail, rateSettings, Math.floor(Date.now() / 1000))
      : null,
  })
}
