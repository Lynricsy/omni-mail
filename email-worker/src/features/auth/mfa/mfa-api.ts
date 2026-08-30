import { writeAudit } from '../../../shared/audit/audit'
import {
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  mfaConfigurationReady,
  recoveryCodeHash,
  verifyEncryptedTotp,
  verifyMfaForUser,
} from './mfa'
import type { Env, SessionUser } from '../../../app/types'

function administrator(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin'
}

export async function mfaStatus(env: Env, user: SessionUser): Promise<Response> {
  if (!administrator(user)) return Response.json({ error: '只有管理员可以启用二次验证。' }, { status: 403 })
  const [row, recovery] = await Promise.all([
    env.DB.prepare(
      'SELECT enabled_at FROM admin_totp WHERE user_id = ?',
    ).bind(user.id).first<{ enabled_at: number | null }>(),
    env.DB.prepare(
      'SELECT COUNT(*) AS count FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL',
    ).bind(user.id).first<{ count: number }>(),
  ])
  return Response.json({
    ready: mfaConfigurationReady(env),
    enabled: Boolean(row?.enabled_at),
    pending: Boolean(row && !row.enabled_at),
    recoveryCodesRemaining: Number(recovery?.count || 0),
  })
}

export async function startMfaSetup(env: Env, user: SessionUser): Promise<Response> {
  if (!administrator(user)) return Response.json({ error: '只有管理员可以启用二次验证。' }, { status: 403 })
  if (!mfaConfigurationReady(env)) {
    return Response.json({ error: '请先配置 TOTP_ENCRYPTION_KEY Worker Secret。' }, { status: 503 })
  }
  const current = await env.DB.prepare(
    'SELECT enabled_at FROM admin_totp WHERE user_id = ?',
  ).bind(user.id).first<{ enabled_at: number | null }>()
  if (current?.enabled_at) return Response.json({ error: '二次验证已经启用。' }, { status: 409 })
  const secret = generateTotpSecret()
  const issuer = (env.APP_NAME || 'OmniMail').trim().slice(0, 60) || 'OmniMail'
  const uri = `otpauth://totp/${encodeURIComponent(`${issuer}:${user.email}`)}`
    + `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
  await env.DB.prepare(
    `INSERT INTO admin_totp (user_id, encrypted_secret, enabled_at, updated_at)
     VALUES (?, ?, NULL, unixepoch())
     ON CONFLICT(user_id) DO UPDATE SET
       encrypted_secret = excluded.encrypted_secret,
       enabled_at = NULL,
       updated_at = excluded.updated_at`,
  ).bind(user.id, await encryptTotpSecret(env, secret)).run()
  return Response.json({ secret, uri }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function confirmMfaSetup(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!administrator(user)) return Response.json({ error: '只有管理员可以启用二次验证。' }, { status: 403 })
  const body = await request.json<{ code?: unknown }>().catch(() => ({} as { code?: unknown }))
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const row = await env.DB.prepare(
    'SELECT encrypted_secret, enabled_at FROM admin_totp WHERE user_id = ?',
  ).bind(user.id).first<{ encrypted_secret: string; enabled_at: number | null }>()
  if (!row || row.enabled_at) return Response.json({ error: '没有等待确认的二次验证设置。' }, { status: 409 })
  if (!await verifyEncryptedTotp(env, row.encrypted_secret, code)) {
    return Response.json({ error: '验证码不正确，请确认验证器时间保持同步。' }, { status: 400 })
  }
  const recoveryCodes = generateRecoveryCodes()
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      'UPDATE admin_totp SET enabled_at = unixepoch(), updated_at = unixepoch() WHERE user_id = ?',
    ).bind(user.id),
    env.DB.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').bind(user.id),
  ]
  for (const recoveryCode of recoveryCodes) {
    statements.push(env.DB.prepare(
      `INSERT INTO mfa_recovery_codes (id, user_id, code_hash)
       VALUES (?, ?, ?)`,
    ).bind(crypto.randomUUID(), user.id, await recoveryCodeHash(recoveryCode)))
  }
  await env.DB.batch(statements)
  await writeAudit(env, user.id, 'auth.mfa.enable', user.id, ip)
  return Response.json(
    { enabled: true, recoveryCodes },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function disableMfa(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!administrator(user)) return Response.json({ error: '只有管理员可以管理二次验证。' }, { status: 403 })
  const body = await request.json<{ code?: unknown }>().catch(() => ({} as { code?: unknown }))
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const verified = await verifyMfaForUser(env, user.id, code)
  if (!verified.ok) return Response.json({ error: '验证码或恢复码不正确。' }, { status: 400 })
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_totp WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM mfa_challenges WHERE user_id = ?').bind(user.id),
  ])
  await writeAudit(env, user.id, 'auth.mfa.disable', user.id, ip)
  return Response.json({ enabled: false })
}
