import {
  createSessionToken,
  hashPassword,
  secretsEqual,
  storeSession,
  validatePassword,
} from '../session/auth'
import { normalizeEmail, validEmail } from '../../../shared/http/api-helpers'
import { writeAudit } from '../../../shared/audit/audit'
import { consumeSetupRateLimit, validSetupTokenSecret } from './setup-security'
import type { Env } from '../../../app/types'

export interface SetupResult {
  response: Response
  sessionToken?: string
}

async function setupComplete(db: D1Database): Promise<boolean> {
  const setting = await db.prepare(
    "SELECT value FROM settings WHERE key = 'setup_complete'",
  ).first<{ value: string }>()
  return setting?.value === '1'
}

function configuredSuperAdminEmail(env: Env): string {
  const email = normalizeEmail(env.SUPER_ADMIN_EMAIL || '')
  return validEmail(email) ? email : ''
}

function json(body: unknown, status = 200): SetupResult {
  return { response: Response.json(body, { status }) }
}

export async function completeSetup(
  env: Env,
  request: Request,
  ip: string,
): Promise<SetupResult> {
  if (await setupComplete(env.DB)) {
    return json({ error: 'OmniMail 已完成初始化。' }, 409)
  }
  const setupToken = env.SETUP_TOKEN
  if (!validSetupTokenSecret(setupToken)) {
    return json({ error: '请配置至少 32 字节的随机 SETUP_TOKEN Secret。' }, 503)
  }
  const email = configuredSuperAdminEmail(env)
  if (!email) {
    return json({ error: '请先在 Worker 中配置有效的 SUPER_ADMIN_EMAIL。' }, 503)
  }

  const body = await request.json<{
    displayName?: string
    password?: string
    setupToken?: string
  }>().catch(() => ({} as {
    displayName?: string
    password?: string
    setupToken?: string
  }))
  const displayName = (body.displayName || '').trim()
  const password = body.password || ''
  const passwordError = validatePassword(password)
  if (!displayName || displayName.length > 60) {
    return json({ error: '显示名称需要在 1–60 个字符之间。' }, 400)
  }
  if (passwordError) return json({ error: passwordError }, 400)

  const rateLimit = await consumeSetupRateLimit(env.DB, ip)
  if (!rateLimit.allowed) {
    const result = json({ error: '初始化尝试过多，请稍后再试。' }, 429)
    result.response.headers.set('Retry-After', String(rateLimit.retryAfter))
    return result
  }
  if (!await secretsEqual(body.setupToken || '', setupToken)) {
    return json({ error: '初始化令牌不正确。' }, 403)
  }

  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('setup_complete', '1')",
      ),
      env.DB.prepare(
        `INSERT INTO users (
          id, email, display_name, password_hash, role, mailbox_limit,
          storage_quota_bytes, can_create_mailboxes, can_reply
        ) VALUES (?, ?, ?, ?, 'super_admin', 100, 5368709120, 1, 1)`,
      ).bind(userId, email, displayName, passwordHash),
    ])
  } catch {
    return json({ error: '初始化失败，可能已有管理员账户。' }, 409)
  }

  const sessionToken = createSessionToken()
  await storeSession(env.DB, userId, sessionToken)
  await writeAudit(env, userId, 'setup.complete', userId, ip)
  return {
    sessionToken,
    response: Response.json({
      user: {
        id: userId,
        email,
        displayName,
        role: 'super_admin' as const,
        mailboxLimit: 100,
        storageQuotaBytes: 5368709120,
        storageUsedBytes: 0,
        canCreateMailboxes: true,
        canReply: true,
        canTranslate: true,
        temporaryExpiresAt: null,
      },
    }, { status: 201 }),
  }
}
