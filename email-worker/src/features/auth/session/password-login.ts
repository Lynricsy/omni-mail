import {
  activeUser,
  consumePasswordCost,
  sha256,
  verifyPassword,
} from './auth'
import { normalizeEmail, validEmail } from '../../../shared/http/api-helpers'
import type { UserRow } from '../../../app/types'

const LOGIN_WINDOW_SECONDS = 15 * 60
const MAX_LOGIN_ATTEMPTS = 5

export type PasswordLoginResult =
  | { user: UserRow; email: string }
  | {
      error: string
      status: 401 | 429
      email: string
      reason: 'invalid_credentials' | 'rate_limited'
    }

async function loginBlocked(db: D1Database, keyHash: string, now: number): Promise<boolean> {
  const row = await db.prepare(
    'SELECT attempts, window_started_at FROM login_attempts WHERE key_hash = ?',
  ).bind(keyHash).first<{ attempts: number; window_started_at: number }>()
  return Boolean(
    row
    && now - row.window_started_at < LOGIN_WINDOW_SECONDS
    && row.attempts >= MAX_LOGIN_ATTEMPTS,
  )
}

async function recordLoginFailure(
  db: D1Database,
  keyHash: string,
  now: number,
): Promise<void> {
  const resetBefore = now - LOGIN_WINDOW_SECONDS
  await db.prepare(
    `INSERT INTO login_attempts (key_hash, attempts, window_started_at)
     VALUES (?, 1, ?)
     ON CONFLICT (key_hash) DO UPDATE SET
       attempts = CASE
         WHEN login_attempts.window_started_at < ? THEN 1
         ELSE login_attempts.attempts + 1
       END,
       window_started_at = CASE
         WHEN login_attempts.window_started_at < ? THEN excluded.window_started_at
         ELSE login_attempts.window_started_at
       END`,
  ).bind(keyHash, now, resetBefore, resetBefore).run()
}

export async function authenticatePassword(
  db: D1Database,
  rawEmail: string,
  password: string,
  ip: string,
): Promise<PasswordLoginResult> {
  const email = normalizeEmail(rawEmail)
  if (!validEmail(email) || !password) {
    return {
      error: '邮箱或密码不正确。',
      status: 401,
      email: validEmail(email) ? email : '',
      reason: 'invalid_credentials',
    }
  }

  const attemptKey = await sha256(`${ip}\n${email}`)
  const now = Math.floor(Date.now() / 1000)
  if (await loginBlocked(db, attemptKey, now)) {
    return {
      error: '登录尝试过多，请 15 分钟后再试。',
      status: 429,
      email,
      reason: 'rate_limited',
    }
  }

  const user = await db.prepare(
    `SELECT id, email, display_name, password_hash, role, status,
            mailbox_limit, can_create_mailboxes, can_reply, can_translate,
            storage_quota_bytes, storage_used_bytes,
            temporary_expires_at, deleted_at, created_at
       FROM users WHERE email = ?`,
  ).bind(email).first<UserRow>()
  const passwordMatches = user
    ? await verifyPassword(password, user.password_hash)
    : (await consumePasswordCost(password), false)

  if (!user || !passwordMatches || !activeUser(user, now)) {
    await recordLoginFailure(db, attemptKey, now)
    return {
      error: '邮箱或密码不正确。',
      status: 401,
      email,
      reason: 'invalid_credentials',
    }
  }
  await db.prepare('DELETE FROM login_attempts WHERE key_hash = ?').bind(attemptKey).run()
  return { user, email }
}
