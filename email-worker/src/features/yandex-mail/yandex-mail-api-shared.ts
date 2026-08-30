import { validEmail } from '../../shared/http/api-helpers'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import { sha256 } from '../auth/session/auth'
import { yandexMailImapEnabled } from './yandex-mail-credentials'
import type { YandexMailImapClient } from './yandex-mail-imap'
import { YandexMailAccountStore, YandexMailStoreError } from './yandex-mail-store'
import { yandexMailSyncErrorCode } from './yandex-mail-sync'
import type { Env, YandexMailSyncJob } from '../../app/types'

const VALIDATION_WINDOW_SECONDS = 10 * 60
const VALIDATION_ATTEMPTS = 5

export function privateYandexMailJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export function yandexMailResponseError(error: unknown): Response {
  if (error instanceof YandexMailStoreError) {
    return privateYandexMailJson({ error: error.message }, error.status)
  }
  if (error instanceof ImapConnectionError) {
    if (error.status === 404) {
      return privateYandexMailJson({ error: 'Yandex 邮箱邮件不存在或已移出收件箱。' }, 404)
    }
    if (error.status === 409) {
      return privateYandexMailJson({ error: error.message }, 409)
    }
    const code = yandexMailSyncErrorCode(error)
    const messages: Record<string, string> = {
      authentication_failed: 'Yandex 邮箱登录失败，请检查邮箱地址、IMAP 服务和应用专用密码。',
      timeout: '连接 Yandex 邮箱超时，请稍后重试。',
      response_too_large: 'Yandex 邮箱返回的邮件内容超过读取上限。',
      connection_failed: '暂时无法连接 Yandex 邮箱，请稍后重试。',
    }
    const status = code === 'authentication_failed' ? 400
      : code === 'response_too_large' ? 413
        : error.status === 504 ? 504 : 502
    return privateYandexMailJson({ error: messages[code] || error.message || messages.connection_failed }, status)
  }
  console.error('Yandex Mail request failed', {
    code: yandexMailSyncErrorCode(error),
    type: error instanceof Error ? error.name : typeof error,
  })
  return privateYandexMailJson({ error: 'Yandex 邮箱暂时无法处理这个请求。' }, 500)
}

export async function yandexMailJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json<unknown>()
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error()
    return body as Record<string, unknown>
  } catch {
    throw new YandexMailStoreError(400, '请求体必须是 JSON 对象。')
  }
}

export function yandexMailNameField(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 60 || /[\r\n\0]/.test(name)) {
    throw new YandexMailStoreError(400, '账号名称需要为 1–60 个字符。')
  }
  return name
}

export function yandexMailEmailField(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!validEmail(email) || /[\r\n\0]/.test(email) || !email.endsWith('@yandex.com')) {
    throw new YandexMailStoreError(400, '请填写完整的个人 @yandex.com 邮箱地址。')
  }
  return email
}

export function yandexMailAppPasswordField(value: unknown): string {
  const code = typeof value === 'string' ? value.trim() : ''
  const size = new TextEncoder().encode(code).byteLength
  if (size < 1 || size > 128 || /[\r\n\0\x00-\x1f\x7f]/.test(code)) {
    throw new YandexMailStoreError(400, '请填写 Yandex 生成的应用专用密码，而不是 Yandex 登录密码。')
  }
  return code
}

export function maskedYandexMailEmail(email: string): string {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}***@${domain}`
}

async function yandexMailClient(email: string, code: string): Promise<YandexMailImapClient> {
  const { YandexMailImapClient } = await import('./yandex-mail-imap')
  return new YandexMailImapClient(email, code)
}

export async function validateYandexMailCredentials(email: string, code: string): Promise<void> {
  const client = await yandexMailClient(email, code)
  try {
    await client.open()
    await client.examineInbox()
  } finally {
    await client.close()
  }
}

export async function claimYandexMailValidationAttempt(
  env: Env,
  userId: string,
  ip: string,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  const identity = await sha256(`${userId}:${ip}`)
  const windowStartedAt = Math.floor(now / VALIDATION_WINDOW_SECONDS) * VALIDATION_WINDOW_SECONDS
  const result = await env.DB.prepare(
    `INSERT INTO yandex_mail_validation_limits (
       identity_hash, window_started_at, attempt_count, updated_at
     ) VALUES (?, ?, 1, ?)
     ON CONFLICT(identity_hash) DO UPDATE SET
       window_started_at = excluded.window_started_at,
       attempt_count = CASE
         WHEN yandex_mail_validation_limits.window_started_at = excluded.window_started_at
           THEN yandex_mail_validation_limits.attempt_count + 1
         ELSE 1
       END,
       updated_at = excluded.updated_at
     WHERE yandex_mail_validation_limits.window_started_at != excluded.window_started_at
        OR yandex_mail_validation_limits.attempt_count < ?`,
  ).bind(identity, windowStartedAt, now, VALIDATION_ATTEMPTS).run()
  if (!result.meta.changes) {
    throw new YandexMailStoreError(429, 'Yandex 邮箱凭据验证过于频繁，请稍后重试。')
  }
}

export async function enqueueYandexMailSync(
  env: Env,
  accountId: string,
  reason: YandexMailSyncJob['reason'],
): Promise<void> {
  const job: YandexMailSyncJob = { kind: 'yandex-mail-sync', accountId, reason }
  await env.MAIL_QUEUE.send(job)
}

export async function recordYandexMailRemoteFailure(
  env: Env,
  accountId: string,
  error: unknown,
): Promise<void> {
  if (error instanceof ImapConnectionError && (error.status === 404 || error.status === 409)) return
  const code = yandexMailSyncErrorCode(error)
  const now = Math.floor(Date.now() / 1000)
  try {
    await env.DB.prepare(
      `UPDATE yandex_mail_accounts SET status = ?, last_error_code = ?,
              last_error_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(code === 'authentication_failed' ? 'credential_error' : 'error', code, now, now, accountId).run()
  } catch { /* preserve remote failure */ }
}

export async function ownedYandexMailAccount(env: Env, userId: string, accountId: string) {
  return new YandexMailAccountStore(env, userId).get(accountId)
}

export function requireYandexMailEnabled(env: Env): void {
  if (!yandexMailImapEnabled(env)) throw new YandexMailStoreError(503, 'Yandex 邮箱功能尚未配置。')
}
