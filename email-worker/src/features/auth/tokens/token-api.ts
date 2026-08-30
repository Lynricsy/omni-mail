import {
  activeUser,
  applySuperAdminRole,
  createSessionToken,
  sessionFromUser,
  sha256,
} from '../session/auth'
import { clientIp } from '../../../shared/http/api-helpers'
import { writeAudit } from '../../../shared/audit/audit'
import { authenticatePassword } from '../session/password-login'
import { mfaEnabled, verifyMfaForLogin } from '../mfa/mfa'
import { deviceScopesForClient, FULL_DEVICE_SCOPES, refreshedDeviceScopes } from './token-scope'
import type { Env, SessionUser, UserRow } from '../../../app/types'

const ACCESS_TOKEN_SECONDS = 15 * 60
const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60
const ACCESS_PREFIX = 'om_at_'
const REFRESH_PREFIX = 'om_rt_'

export type DeviceUserRow = Pick<
  UserRow,
  | 'id'
  | 'email'
  | 'display_name'
  | 'role'
  | 'status'
  | 'mailbox_limit'
  | 'storage_quota_bytes'
  | 'storage_used_bytes'
  | 'can_create_mailboxes'
  | 'can_reply'
  | 'can_translate'
  | 'temporary_expires_at'
  | 'deleted_at'
>

interface RefreshRow extends DeviceUserRow {
  device_session_id: string
  device_name: string
  scopes: string
}

interface DeviceRow {
  id: string
  device_name: string
  access_expires_at: number
  refresh_expires_at: number
  last_used_at: number
  created_at: number
  scopes: string
}

export interface DeviceIdentity {
  user: SessionUser
  deviceSessionId: string
  scopes: string
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function token(prefix: string): string {
  return `${prefix}${createSessionToken()}`
}

function validToken(value: unknown, prefix: string): value is string {
  return typeof value === 'string'
    && value.startsWith(prefix)
    && value.length > prefix.length + 20
    && value.length <= 160
}

function deviceName(value: unknown): string {
  if (typeof value !== 'string') return ''
  const name = value.trim()
  return name.length <= 80 ? name : ''
}

export async function createDeviceSession(
  env: Env,
  user: DeviceUserRow,
  name: string,
  scopes = FULL_DEVICE_SCOPES,
  existingId?: string,
  oldRefreshHash?: string,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000)
  const accessToken = token(ACCESS_PREFIX)
  const refreshToken = token(REFRESH_PREFIX)
  const accessHash = await sha256(accessToken)
  const refreshHash = await sha256(refreshToken)
  const id = existingId || crypto.randomUUID()

  if (existingId && oldRefreshHash) {
    const updated = await env.DB.prepare(
      `UPDATE device_sessions
          SET access_token_hash = ?, access_expires_at = ?,
              refresh_token_hash = ?, refresh_expires_at = ?,
              last_used_at = ?, revoked_at = NULL
        WHERE id = ? AND refresh_token_hash = ? AND revoked_at IS NULL`,
    ).bind(
      accessHash,
      now + ACCESS_TOKEN_SECONDS,
      refreshHash,
      now + REFRESH_TOKEN_SECONDS,
      now,
      existingId,
      oldRefreshHash,
    ).run()
    if (!updated.meta.changes) {
      return json({ error: '刷新令牌已失效，请重新登录。' }, 401)
    }
  } else {
    await env.DB.prepare(
      `INSERT INTO device_sessions (
        id, user_id, device_name, access_token_hash, access_expires_at,
        refresh_token_hash, refresh_expires_at, last_used_at, scopes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      user.id,
      name,
      accessHash,
      now + ACCESS_TOKEN_SECONDS,
      refreshHash,
      now + REFRESH_TOKEN_SECONDS,
      now,
      scopes,
    ).run()
  }

  return json({
    tokenType: 'Bearer',
    accessToken,
    expiresIn: ACCESS_TOKEN_SECONDS,
    refreshToken,
    refreshExpiresIn: REFRESH_TOKEN_SECONDS,
    scopes: scopes.split(' '),
    user: applySuperAdminRole(sessionFromUser(user), env.SUPER_ADMIN_EMAIL),
  })
}

export function bearerToken(header: string | undefined): string | undefined | null {
  if (header === undefined) return undefined
  const matched = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return matched ? matched[1] : null
}

export async function authenticateAccessToken(
  env: Env,
  accessToken: string,
): Promise<DeviceIdentity | null> {
  if (!validToken(accessToken, ACCESS_PREFIX)) return null
  const now = Math.floor(Date.now() / 1000)
  const row = await env.DB.prepare(
    `SELECT d.id AS device_session_id, d.device_name, d.scopes,
            u.id, u.email, u.display_name, u.role, u.status,
            u.mailbox_limit, u.can_create_mailboxes, u.can_reply, u.can_translate,
            u.storage_quota_bytes, u.storage_used_bytes,
            u.temporary_expires_at, u.deleted_at
       FROM device_sessions d
       JOIN users u ON u.id = d.user_id
      WHERE d.access_token_hash = ? AND d.revoked_at IS NULL
        AND d.access_expires_at > ?`,
  ).bind(await sha256(accessToken), now).first<RefreshRow>()
  if (!row || !activeUser(row, now)) return null
  await env.DB.prepare(
    `UPDATE device_sessions SET last_used_at = ?
      WHERE id = ? AND last_used_at < ?`,
  ).bind(now, row.device_session_id, now - 300).run()
  return {
    user: applySuperAdminRole(sessionFromUser(row), env.SUPER_ADMIN_EMAIL),
    deviceSessionId: row.device_session_id,
    scopes: row.scopes,
  }
}

export async function issueDeviceToken(env: Env, request: Request): Promise<Response> {
  const body = await request.json<{
    email?: unknown
    password?: unknown
    deviceName?: unknown
    mfaCode?: unknown
    client?: unknown
  }>().catch(() => ({} as {
    email?: unknown
    password?: unknown
    deviceName?: unknown
    mfaCode?: unknown
    client?: unknown
  }))
  const name = deviceName(body.deviceName)
  if (!name) return json({ error: '设备名称需要在 1–80 个字符之间。' }, 400)
  const result = await authenticatePassword(
    env.DB,
    typeof body.email === 'string' ? body.email : '',
    typeof body.password === 'string' ? body.password : '',
    clientIp(request.headers),
  )
  if ('error' in result) {
    await writeAudit(
      env,
      null,
      'auth.login_failed',
      result.email || null,
      clientIp(request.headers),
      { channel: 'token', reason: result.reason, deviceName: name },
    )
    return json({ error: result.error }, result.status)
  }
  if (await mfaEnabled(env.DB, result.user.id)) {
    const code = typeof body.mfaCode === 'string' ? body.mfaCode : ''
    const verified = await verifyMfaForLogin(
      env, result.user.id, code, clientIp(request.headers),
    )
    if (!verified.ok) {
      await writeAudit(
        env,
        result.user.id,
        'auth.login_failed',
        result.user.id,
        clientIp(request.headers),
        { channel: 'token', reason: 'invalid_mfa', deviceName: name },
      )
      return json({ error: '需要有效的二次验证码或恢复码。' }, 401)
    }
  }

  const response = await createDeviceSession(
    env,
    result.user,
    name,
    deviceScopesForClient(body.client),
  )
  if (response.ok) {
    await writeAudit(
      env,
      result.user.id,
      'auth.token.issue',
      result.user.id,
      clientIp(request.headers),
      { deviceName: name },
    )
  }
  return response
}

export async function refreshDeviceToken(env: Env, request: Request): Promise<Response> {
  const body = await request.json<{ refreshToken?: unknown; client?: unknown }>()
    .catch(() => ({} as { refreshToken?: unknown; client?: unknown }))
  if (!validToken(body.refreshToken, REFRESH_PREFIX)) {
    return json({ error: '刷新令牌无效，请重新登录。' }, 401)
  }
  const now = Math.floor(Date.now() / 1000)
  const refreshHash = await sha256(body.refreshToken)
  const row = await env.DB.prepare(
    `SELECT d.id AS device_session_id, d.device_name, d.scopes,
            u.id, u.email, u.display_name, u.role, u.status,
            u.mailbox_limit, u.can_create_mailboxes, u.can_reply, u.can_translate,
            u.storage_quota_bytes, u.storage_used_bytes,
            u.temporary_expires_at, u.deleted_at
       FROM device_sessions d
       JOIN users u ON u.id = d.user_id
      WHERE d.refresh_token_hash = ? AND d.revoked_at IS NULL
        AND d.refresh_expires_at > ?`,
  ).bind(refreshHash, now).first<RefreshRow>()
  if (!row || !activeUser(row, now)) {
    return json({ error: '刷新令牌已失效，请重新登录。' }, 401)
  }
  return createDeviceSession(
    env,
    row,
    row.device_name,
    refreshedDeviceScopes(row.scopes, body.client),
    row.device_session_id,
    refreshHash,
  )
}

export async function revokeRefreshToken(env: Env, request: Request): Promise<Response> {
  const body = await request.json<{ refreshToken?: unknown }>()
    .catch(() => ({} as { refreshToken?: unknown }))
  if (validToken(body.refreshToken, REFRESH_PREFIX)) {
    const refreshHash = await sha256(body.refreshToken)
    const session = await env.DB.prepare(
      'SELECT id, user_id FROM device_sessions WHERE refresh_token_hash = ?',
    ).bind(refreshHash).first<{ id: string; user_id: string }>()
    const revoked = await env.DB.prepare(
      `UPDATE device_sessions SET revoked_at = COALESCE(revoked_at, unixepoch())
        WHERE refresh_token_hash = ? AND revoked_at IS NULL`,
    ).bind(refreshHash).run()
    if (session && revoked.meta.changes) {
      await writeAudit(
        env,
        session.user_id,
        'auth.token.revoke',
        session.id,
        clientIp(request.headers),
      )
    }
  }
  return json({ ok: true })
}

export async function listDevices(
  env: Env,
  user: SessionUser,
  currentId?: string,
): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, device_name, access_expires_at, refresh_expires_at,
            last_used_at, created_at, scopes
       FROM device_sessions
      WHERE user_id = ? AND revoked_at IS NULL AND refresh_expires_at > unixepoch()
      ORDER BY last_used_at DESC, id`,
  ).bind(user.id).all<DeviceRow>()
  return json({
    devices: results.map((row) => ({
      id: row.id,
      deviceName: row.device_name,
      accessExpiresAt: row.access_expires_at,
      refreshExpiresAt: row.refresh_expires_at,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      scopes: row.scopes.split(' '),
      current: row.id === currentId,
    })),
  })
}

export async function revokeDevice(
  env: Env,
  user: SessionUser,
  id: string,
  ip: string,
): Promise<Response> {
  const result = await env.DB.prepare(
    `UPDATE device_sessions SET revoked_at = COALESCE(revoked_at, unixepoch())
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
  ).bind(id, user.id).run()
  if (!result.meta.changes) return json({ error: '设备会话不存在。' }, 404)
  await writeAudit(env, user.id, 'auth.device.revoke', id, ip)
  return json({ ok: true })
}
