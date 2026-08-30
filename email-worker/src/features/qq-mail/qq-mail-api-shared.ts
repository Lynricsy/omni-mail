import { validEmail } from '../../shared/http/api-helpers'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import { sha256 } from '../auth/session/auth'
import { qqMailImapEnabled } from './qq-mail-credentials'
import type { QqMailImapClient } from './qq-mail-imap'
import { QqMailAccountStore, QqMailStoreError } from './qq-mail-store'
import { qqMailSyncErrorCode } from './qq-mail-sync'
import type { Env, MailSyncLimit, QqMailSyncJob } from '../../app/types'

const VALIDATION_WINDOW_SECONDS = 10 * 60
const VALIDATION_ATTEMPTS = 5

export function privateQqMailJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export function qqMailResponseError(error: unknown): Response {
  if (error instanceof QqMailStoreError) {
    return privateQqMailJson({ error: error.message }, error.status)
  }
  if (error instanceof ImapConnectionError) {
    if (error.status === 404) {
      return privateQqMailJson({ error: 'QQ 邮箱邮件不存在或已移出收件箱。' }, 404)
    }
    if (error.status === 409) {
      return privateQqMailJson({ error: error.message }, 409)
    }
    const code = qqMailSyncErrorCode(error)
    const messages: Record<string, string> = {
      authentication_failed: 'QQ 邮箱登录失败，请检查邮箱地址、IMAP 服务和授权码。',
      timeout: '连接 QQ 邮箱超时，请稍后重试。',
      response_too_large: 'QQ 邮箱返回的邮件内容超过读取上限。',
      connection_failed: '暂时无法连接 QQ 邮箱，请稍后重试。',
    }
    const status = code === 'authentication_failed' ? 400
      : code === 'response_too_large' ? 413
        : error.status === 504 ? 504 : 502
    return privateQqMailJson({ error: messages[code] || error.message || messages.connection_failed }, status)
  }
  console.error('QQ Mail request failed', {
    code: qqMailSyncErrorCode(error),
    type: error instanceof Error ? error.name : typeof error,
  })
  return privateQqMailJson({ error: 'QQ 邮箱暂时无法处理这个请求。' }, 500)
}

export async function qqMailJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json<unknown>()
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error()
    return body as Record<string, unknown>
  } catch {
    throw new QqMailStoreError(400, '请求体必须是 JSON 对象。')
  }
}

export function qqMailNameField(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 60 || /[\r\n\0]/.test(name)) {
    throw new QqMailStoreError(400, '账号名称需要为 1–60 个字符。')
  }
  return name
}

export function qqMailEmailField(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!validEmail(email) || /[\r\n\0]/.test(email) || !email.endsWith('@qq.com')) {
    throw new QqMailStoreError(400, '请填写完整的个人 @qq.com 邮箱地址。')
  }
  return email
}

export function qqMailIdentityEmailField(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const domain = email.slice(email.lastIndexOf('@') + 1)
  if (!validEmail(email) || /[\r\n\0]/.test(email)
    || !['qq.com', 'foxmail.com', 'vip.qq.com'].includes(domain)) {
    throw new QqMailStoreError(
      400,
      '发信身份必须是 @qq.com、@foxmail.com 或 @vip.qq.com 邮箱地址。',
    )
  }
  return email
}

export function qqMailAuthorizationCodeField(value: unknown): string {
  const code = typeof value === 'string' ? value.trim() : ''
  const size = new TextEncoder().encode(code).byteLength
  if (size < 1 || size > 128 || /[\r\n\0\x00-\x1f\x7f]/.test(code)) {
    throw new QqMailStoreError(400, '请填写 QQ 邮箱生成的授权码，而不是 QQ 登录密码。')
  }
  return code
}

export function maskedQqMailEmail(email: string): string {
  return email.split(/[;,]/).map((value) => {
    const [local, ...domainParts] = value.trim().split('@')
    const domain = domainParts.join('@')
    return domain
      ? `${local.slice(0, 2)}***@${domain}`
      : local
  }).join(', ')
}

async function qqMailClient(email: string, code: string): Promise<QqMailImapClient> {
  const { QqMailImapClient } = await import('./qq-mail-imap')
  return new QqMailImapClient(email, code)
}

export async function validateQqMailCredentials(email: string, code: string): Promise<void> {
  const client = await qqMailClient(email, code)
  try {
    await client.open()
    await client.examineInbox()
  } finally {
    await client.close()
  }
}

export async function validateQqMailSenderIdentity(email: string, code: string): Promise<void> {
  const { QqMailSmtpClient, QqMailSmtpError } = await import('./qq-mail-smtp')
  const client = new QqMailSmtpClient(email, code)
  try {
    await client.open()
  } catch (error) {
    if (error instanceof QqMailSmtpError) {
      throw new QqMailStoreError(
        error.credentialFailure ? 400 : 502,
        error.credentialFailure
          ? 'QQ SMTP 无法验证这个发信身份；请确认该地址已在同一 QQ 邮箱账号中启用。'
          : error.message || 'QQ SMTP 暂时无法验证这个发信身份。',
      )
    }
    throw error
  } finally {
    await client.close()
  }
}

export async function claimQqMailValidationAttempt(
  env: Env,
  userId: string,
  ip: string,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  const identity = await sha256(`${userId}:${ip}`)
  const windowStartedAt = Math.floor(now / VALIDATION_WINDOW_SECONDS) * VALIDATION_WINDOW_SECONDS
  const result = await env.DB.prepare(
    `INSERT INTO qq_mail_validation_limits (
       identity_hash, window_started_at, attempt_count, updated_at
     ) VALUES (?, ?, 1, ?)
     ON CONFLICT(identity_hash) DO UPDATE SET
       window_started_at = excluded.window_started_at,
       attempt_count = CASE
         WHEN qq_mail_validation_limits.window_started_at = excluded.window_started_at
           THEN qq_mail_validation_limits.attempt_count + 1
         ELSE 1
       END,
       updated_at = excluded.updated_at
     WHERE qq_mail_validation_limits.window_started_at != excluded.window_started_at
        OR qq_mail_validation_limits.attempt_count < ?`,
  ).bind(identity, windowStartedAt, now, VALIDATION_ATTEMPTS).run()
  if (!result.meta.changes) {
    throw new QqMailStoreError(429, 'QQ 邮箱凭据验证过于频繁，请稍后重试。')
  }
}

export async function enqueueQqMailSync(
  env: Env,
  accountId: string,
  reason: QqMailSyncJob['reason'],
  limit?: MailSyncLimit,
): Promise<void> {
  const job: QqMailSyncJob = { kind: 'qq-mail-sync', accountId, reason, limit }
  await env.MAIL_QUEUE.send(job)
}

export async function recordQqMailRemoteFailure(
  env: Env,
  accountId: string,
  error: unknown,
): Promise<void> {
  if (error instanceof ImapConnectionError && error.status === 404) return
  const code = qqMailSyncErrorCode(error)
  const now = Math.floor(Date.now() / 1000)
  try {
    await env.DB.prepare(
      `UPDATE qq_mail_accounts SET status = ?, last_error_code = ?,
              last_error_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(code === 'authentication_failed' ? 'credential_error' : 'error', code, now, now, accountId).run()
  } catch { /* preserve remote failure */ }
}

export async function ownedQqMailAccount(env: Env, userId: string, accountId: string) {
  return new QqMailAccountStore(env, userId).get(accountId)
}

export function requireQqMailEnabled(env: Env): void {
  if (!qqMailImapEnabled(env)) throw new QqMailStoreError(503, 'QQ 邮箱功能尚未配置。')
}
