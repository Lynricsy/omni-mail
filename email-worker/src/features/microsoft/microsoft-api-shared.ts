import { ImapConnectionError } from '../../platform/imap/imap-errors'
import { MicrosoftInputError } from './microsoft-fields'
import { MicrosoftStoreError } from './microsoft-store'
import { MicrosoftTokenError } from './microsoft-token'
import { microsoftSyncErrorCode } from './microsoft-sync'
import type { MicrosoftAuthMode } from './microsoft-types'

export function microsoftPrivateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

const messages: Record<string, string> = {
  invalid_grant: 'Microsoft 授权已失效或 refresh token 与 Client ID 不匹配。',
  invalid_client: 'Microsoft Client ID 无法用于这份 refresh token。',
  invalid_scope: 'Microsoft 授权不包含 Outlook IMAP 权限。',
  imap_scope_missing: 'Microsoft token 缺少 Outlook IMAP 权限，请重新授权。',
  imap_access_rejected: 'Microsoft 拒绝 IMAP OAuth2 登录；请检查权限或租户是否启用 IMAP。',
  xoauth2_unavailable: 'Microsoft IMAP 未提供 XOAUTH2 认证。',
  basic_auth_rejected: 'Microsoft 拒绝密码 LOGIN；这不是导入格式错误。请改用包含 refresh token 与 Client ID 的 OAuth2 四字段凭据。',
  timeout: '连接 Microsoft 邮箱超时，请稍后重试。',
  response_too_large: 'Microsoft 邮箱响应超过安全读取上限。',
  connection_failed: '暂时无法连接 Microsoft 邮箱，请稍后重试。',
  token_endpoint_unavailable: 'Microsoft token 服务暂时不可用，请稍后重试。',
  token_refresh_busy: 'Microsoft token 正在刷新，请稍后重试。',
}

export function microsoftResponseError(
  error: unknown,
  authMode?: MicrosoftAuthMode,
): Response {
  if (error instanceof MicrosoftInputError) {
    return microsoftPrivateJson({ error: error.message, code: error.code }, 400)
  }
  if (error instanceof MicrosoftStoreError) {
    return microsoftPrivateJson({ error: error.message, code: error.code }, error.status)
  }
  if (error instanceof MicrosoftTokenError) {
    return microsoftPrivateJson({
      error: messages[error.code] || 'Microsoft token 刷新失败。',
      code: error.code,
    }, error.status)
  }
  if (error instanceof ImapConnectionError) {
    const code = microsoftSyncErrorCode(error, authMode)
    const status = code === 'response_too_large' ? 413
      : error.status === 404 ? 404
        : error.status === 504 ? 504
          : (error.status === 400 || error.status === 401) ? 400 : 502
    return microsoftPrivateJson({
      error: messages[code] || messages.connection_failed,
      code,
    }, status)
  }
  console.error('Microsoft mail request failed', {
    code: microsoftSyncErrorCode(error, authMode),
    type: error instanceof Error ? error.name : typeof error,
  })
  return microsoftPrivateJson({
    error: 'Microsoft 邮箱暂时无法处理这个请求。',
    code: 'request_failed',
  }, 500)
}

export async function microsoftJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json<unknown>()
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error()
    return body as Record<string, unknown>
  } catch {
    throw new MicrosoftInputError('invalid_json', '请求体必须是 JSON 对象。')
  }
}

export function microsoftName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 60 || /[\r\n\0]/.test(name)) {
    throw new MicrosoftInputError('invalid_name', '账号名称需要为 1–60 个字符。')
  }
  return name
}

export function maskedMicrosoftEmail(email: string): string {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}***@${domain}`
}
