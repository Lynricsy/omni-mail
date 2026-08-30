import {
  createSessionToken,
  hashPassword,
  sessionMaxAge,
  sha256,
  validatePassword,
  verifyPassword,
} from '../session/auth'
import type { Env, SessionUser } from '../../../app/types'

interface AccountUpdateInput {
  displayName?: unknown
  currentPassword?: unknown
  newPassword?: unknown
}

interface AccountDeleteInput {
  currentPassword?: unknown
  confirmationEmail?: unknown
}

export interface AccountUpdate {
  displayName?: string
  currentPassword?: string
  newPassword?: string
}

type ValidationResult =
  | { value: AccountUpdate }
  | { error: string }

type DeleteValidationResult =
  | { currentPassword?: string }
  | { error: string; status: 400 | 403 }

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

export function validateAccountUpdate(input: AccountUpdateInput): ValidationResult {
  const value: AccountUpdate = {}

  if (input.displayName !== undefined) {
    if (typeof input.displayName !== 'string') return { error: '显示名称格式不正确。' }
    const displayName = input.displayName.trim()
    if (!displayName || displayName.length > 60) {
      return { error: '显示名称需要在 1–60 个字符之间。' }
    }
    value.displayName = displayName
  }

  if (input.newPassword !== undefined) {
    if (typeof input.newPassword !== 'string') return { error: '新密码格式不正确。' }
    if (typeof input.currentPassword !== 'string' || !input.currentPassword) {
      return { error: '请输入当前密码。' }
    }
    if (input.currentPassword.length > 128) return { error: '当前密码不正确。' }
    const passwordError = validatePassword(input.newPassword)
    if (passwordError) return { error: passwordError }
    value.currentPassword = input.currentPassword
    value.newPassword = input.newPassword
  }

  if (value.displayName === undefined && value.newPassword === undefined) {
    return { error: '没有需要保存的账户更改。' }
  }
  return { value }
}

export function validateAccountDeletion(
  user: Pick<SessionUser, 'email' | 'role'>,
  input: AccountDeleteInput,
): DeleteValidationResult {
  if (user.role !== 'user' && user.role !== 'temporary') {
    return { error: '只有普通用户和临时用户可以自行注销账号。', status: 403 }
  }
  if (user.role === 'user') {
    if (
      typeof input.confirmationEmail !== 'string'
      || input.confirmationEmail.trim().toLowerCase() !== user.email.toLowerCase()
    ) return { error: '请输入当前登录邮箱以确认注销。', status: 400 }
    return {}
  }
  if (
    typeof input.currentPassword !== 'string'
    || !input.currentPassword
    || input.currentPassword.length > 128
  ) return { error: '请输入当前密码以确认删除。', status: 400 }
  return { currentPassword: input.currentPassword }
}

async function audit(
  env: Env,
  userId: string,
  action: string,
  ip: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (user_id, action, target_id, ip, detail_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(userId, action, userId, ip, JSON.stringify(detail)).run()
}

export async function updateAccount(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
  currentSessionToken?: string,
): Promise<Response> {
  const body = await request.json<AccountUpdateInput>()
    .catch(() => ({} as AccountUpdateInput))
  const result = validateAccountUpdate(body)
  if ('error' in result) return json({ error: result.error }, 400)

  const { displayName, currentPassword, newPassword } = result.value
  let replacementSessionToken = ''
  if (newPassword) {
    const stored = await env.DB.prepare(
      'SELECT password_hash FROM users WHERE id = ?',
    ).bind(user.id).first<{ password_hash: string }>()
    if (!stored || !await verifyPassword(currentPassword || '', stored.password_hash)) {
      return json({ error: '当前密码不正确。' }, 403)
    }
  }

  const statements: D1PreparedStatement[] = []
  if (displayName !== undefined) {
    statements.push(env.DB.prepare(
      'UPDATE users SET display_name = ?, updated_at = unixepoch() WHERE id = ?',
    ).bind(displayName, user.id))
  }
  if (newPassword) {
    statements.push(env.DB.prepare(
      'UPDATE users SET password_hash = ?, updated_at = unixepoch() WHERE id = ?',
    ).bind(await hashPassword(newPassword), user.id))
    statements.push(env.DB.prepare(
      `UPDATE device_sessions SET revoked_at = COALESCE(revoked_at, unixepoch())
        WHERE user_id = ?`,
    ).bind(user.id))
    statements.push(env.DB.prepare(
      'DELETE FROM sessions WHERE user_id = ?',
    ).bind(user.id))
    if (currentSessionToken) {
      replacementSessionToken = createSessionToken()
      statements.push(env.DB.prepare(
        'INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)',
      ).bind(
        await sha256(replacementSessionToken),
        user.id,
        Math.floor(Date.now() / 1000) + sessionMaxAge,
      ))
    }
  }
  await env.DB.batch(statements)
  await audit(env, user.id, 'account.update', ip, {
    displayNameChanged: displayName !== undefined,
    passwordChanged: Boolean(newPassword),
  })

  const response = json({
    user: {
      ...user,
      displayName: displayName ?? user.displayName,
    },
  })
  if (replacementSessionToken) {
    response.headers.set('X-OmniMail-Replacement-Session', replacementSessionToken)
  }
  return response
}

export async function deleteAccount(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  const body = await request.json<AccountDeleteInput>()
    .catch(() => ({} as AccountDeleteInput))
  const validation = validateAccountDeletion(user, body)
  if ('error' in validation) return json({ error: validation.error }, validation.status)

  if (validation.currentPassword) {
    const stored = await env.DB.prepare(
      'SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL',
    ).bind(user.id).first<{ password_hash: string }>()
    if (!stored || !await verifyPassword(validation.currentPassword, stored.password_hash)) {
      return json({ error: '当前密码不正确。' }, 403)
    }
  }

  const now = Math.floor(Date.now() / 1000)
  await audit(env, user.id, 'account.delete', ip, {
    scheduledCleanup: true,
    reason: 'self_service',
  })
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    env.DB.prepare(
      `UPDATE device_sessions SET revoked_at = COALESCE(revoked_at, ?)
        WHERE user_id = ?`,
    ).bind(now, user.id),
    env.DB.prepare(
      `UPDATE users
          SET status = 'disabled', deleted_at = ?, updated_at = ?
        WHERE id = ? AND role IN ('user', 'temporary') AND deleted_at IS NULL`,
    ).bind(now, now, user.id),
  ])
  return json({ ok: true })
}

export async function expireTemporaryAccounts(env: Env, now: number): Promise<void> {
  const expired = `role = 'temporary' AND deleted_at IS NULL
    AND temporary_expires_at IS NOT NULL AND temporary_expires_at <= ?`
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO audit_logs (user_id, action, target_id, ip, detail_json)
       SELECT id, 'account.expire', id, 'cron',
              '{"scheduledCleanup":true,"reason":"expired"}'
         FROM users WHERE ${expired}`,
    ).bind(now),
    env.DB.prepare(
      `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE ${expired})`,
    ).bind(now),
    env.DB.prepare(
      `UPDATE device_sessions SET revoked_at = COALESCE(revoked_at, ?)
        WHERE user_id IN (SELECT id FROM users WHERE ${expired})`,
    ).bind(now, now),
    env.DB.prepare(
      `UPDATE users
          SET status = 'disabled', deleted_at = ?, updated_at = ?
        WHERE ${expired}`,
    ).bind(now, now, now),
  ])
}
