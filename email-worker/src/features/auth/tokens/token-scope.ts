export const FULL_DEVICE_SCOPES = '*'
export const ANDROID_DEVICE_SCOPES = [
  'account:write',
  'mailboxes:read',
  'messages:read',
  'messages:write',
  'messages:send',
  'messages:attachments:read',
  'drafts:read',
  'drafts:write',
  'icloud:accounts:read',
  'icloud:accounts:write',
  'icloud:aliases:read',
  'icloud:aliases:preview',
  'icloud:aliases:create',
  'icloud:aliases:write',
  'icloud:messages:read',
].join(' ')
export const EXTENSION_DEVICE_SCOPES = [
  'mail-notifications:read',
  'domains:read',
  'mailboxes:read',
  'mailboxes:create',
  'messages:read',
  'messages:mark-read',
  'messages:attachments:read',
  'messages:send',
  'drafts:read',
  'drafts:write',
  'icloud:accounts:read',
  'icloud:aliases:read',
  'icloud:aliases:create',
  'icloud:messages:read',
  'gmail:accounts:read',
  'gmail:messages:read',
  'gmail:attachments:read',
  'gmail:sync',
  'qq-mail:accounts:read',
  'qq-mail:messages:read',
  'qq-mail:attachments:read',
  'qq-mail:sync',
  'qq-mail:messages:send',
  'microsoft:accounts:read',
  'microsoft:messages:read',
  'microsoft:attachments:read',
  'microsoft:folders:read',
  'microsoft:sync',
  'naver-mail:accounts:read',
  'naver-mail:messages:read',
  'naver-mail:attachments:read',
  'naver-mail:sync',
  'yandex-mail:accounts:read',
  'yandex-mail:messages:read',
  'yandex-mail:attachments:read',
  'yandex-mail:sync',
  'linuxdo-mail:account:read',
  'linuxdo-mail:messages:read',
  'linuxdo-mail:messages:send',
].join(' ')

function hasScope(scopes: string, required: string): boolean {
  if (scopes === FULL_DEVICE_SCOPES) return true
  return scopes.split(/\s+/).includes(required)
}

export function deviceScopesForClient(client: unknown): string {
  return client === 'android' ? ANDROID_DEVICE_SCOPES : FULL_DEVICE_SCOPES
}

export function refreshedDeviceScopes(existingScopes: string, client: unknown): string {
  if (existingScopes !== FULL_DEVICE_SCOPES) return existingScopes
  return deviceScopesForClient(client)
}

async function markReadRequest(request: Request): Promise<boolean> {
  const body = await request.clone().json<Record<string, unknown>>().catch(() => null)
  return Boolean(
    body
    && Object.keys(body).length === 1
    && body.isRead === true,
  )
}

export async function deviceScopesAllow(scopes: string, request: Request): Promise<boolean> {
  if (scopes === FULL_DEVICE_SCOPES) return true
  const requestMethod = request.method.toUpperCase()
  const path = new URL(request.url).pathname
  if (requestMethod === 'GET' && path === '/api/mail-notifications') {
    return hasScope(scopes, 'mail-notifications:read')
  }
  if (requestMethod === 'GET' && path === '/api/domains') {
    return hasScope(scopes, 'domains:read')
  }
  if (path === '/api/mailboxes') {
    if (requestMethod === 'GET') return hasScope(scopes, 'mailboxes:read')
    if (requestMethod === 'POST') return hasScope(scopes, 'mailboxes:create')
  }
  if (requestMethod === 'GET' && /^\/api\/messages(?:\/[^/]+)?$/.test(path)) {
    return hasScope(scopes, 'messages:read')
  }
  if (requestMethod === 'GET' && /^\/api\/messages\/[^/]+\/attachments\/[^/]+$/.test(path)) {
    return hasScope(scopes, 'messages:attachments:read')
  }
  if (requestMethod === 'PATCH' && /^\/api\/messages\/[^/]+$/.test(path)) {
    return hasScope(scopes, 'messages:write')
      || (hasScope(scopes, 'messages:mark-read') && await markReadRequest(request))
  }
  if (requestMethod === 'PATCH' && path === '/api/messages/bulk') {
    return hasScope(scopes, 'messages:write')
  }
  if (requestMethod === 'DELETE' && /^\/api\/messages\/[^/]+$/.test(path)) {
    return hasScope(scopes, 'messages:write')
  }
  if (requestMethod === 'POST' && path === '/api/messages') {
    return hasScope(scopes, 'messages:send')
  }
  if (requestMethod === 'POST' && /^\/api\/messages\/[^/]+\/reply$/.test(path)) {
    return hasScope(scopes, 'messages:send')
  }
  if (requestMethod === 'PATCH' && path === '/api/account') {
    return hasScope(scopes, 'account:write')
  }
  if (path === '/api/drafts') {
    if (requestMethod === 'GET') return hasScope(scopes, 'drafts:read')
    if (requestMethod === 'POST') return hasScope(scopes, 'drafts:write')
  }
  if (/^\/api\/drafts\/[^/]+$/.test(path)) {
    if (requestMethod === 'GET') return hasScope(scopes, 'drafts:read')
    if (requestMethod === 'PUT' || requestMethod === 'DELETE') {
      return hasScope(scopes, 'drafts:write')
    }
  }
  if (requestMethod === 'POST' && /^\/api\/drafts\/[^/]+\/attachments$/.test(path)) {
    return hasScope(scopes, 'drafts:write')
  }
  if (requestMethod === 'DELETE' && /^\/api\/drafts\/[^/]+\/attachments\/[^/]+$/.test(path)) {
    return hasScope(scopes, 'drafts:write')
  }
  if (requestMethod === 'POST' && /^\/api\/drafts\/[^/]+\/send$/.test(path)) {
    return hasScope(scopes, 'drafts:write') && hasScope(scopes, 'messages:send')
  }
  if (requestMethod === 'GET' && path === '/api/icloud/accounts') {
    return hasScope(scopes, 'icloud:accounts:read')
  }
  if (requestMethod === 'POST' && path === '/api/icloud/accounts') {
    return hasScope(scopes, 'icloud:accounts:write')
  }
  if (/^\/api\/icloud\/accounts\/[^/]+$/.test(path)
    && (requestMethod === 'PATCH' || requestMethod === 'DELETE')) {
    return hasScope(scopes, 'icloud:accounts:write')
  }
  if (/^\/api\/icloud\/accounts\/[^/]+\/(?:cookies|app-password)$/.test(path)
    && requestMethod === 'PUT') {
    return hasScope(scopes, 'icloud:accounts:write')
  }
  if (requestMethod === 'GET' && path === '/api/icloud/aliases') {
    return hasScope(scopes, 'icloud:aliases:read')
  }
  if (requestMethod === 'POST' && path === '/api/icloud/aliases/preview') {
    return hasScope(scopes, 'icloud:aliases:preview')
  }
  if (requestMethod === 'POST' && path === '/api/icloud/aliases') {
    return hasScope(scopes, 'icloud:aliases:create')
  }
  if (/^\/api\/icloud\/aliases\/[^/]+$/.test(path)
    && (requestMethod === 'PATCH' || requestMethod === 'DELETE')) {
    return hasScope(scopes, 'icloud:aliases:write')
  }
  if (requestMethod === 'GET' && /^\/api\/icloud\/inbox(?:\/[^/]+)?$/.test(path)) {
    return hasScope(scopes, 'icloud:messages:read')
  }
  if (requestMethod === 'GET' && path === '/api/gmail/accounts') {
    return hasScope(scopes, 'gmail:accounts:read')
  }
  if (requestMethod === 'GET' && (
    path === '/api/gmail/messages'
    || /^\/api\/gmail\/accounts\/[^/]+\/messages\/[^/]+$/.test(path)
  )) return hasScope(scopes, 'gmail:messages:read')
  if (requestMethod === 'GET'
    && /^\/api\/gmail\/accounts\/[^/]+\/messages\/[^/]+\/attachments\/[^/]+$/.test(path)) {
    return hasScope(scopes, 'gmail:attachments:read')
  }
  if (requestMethod === 'POST' && /^\/api\/gmail\/accounts\/[^/]+\/sync$/.test(path)) {
    return hasScope(scopes, 'gmail:sync')
  }
  if (requestMethod === 'GET' && path === '/api/qq-mail/accounts') {
    return hasScope(scopes, 'qq-mail:accounts:read')
  }
  if (requestMethod === 'GET' && (
    path === '/api/qq-mail/messages'
    || /^\/api\/qq-mail\/accounts\/[^/]+\/messages\/[^/]+$/.test(path)
  )) return hasScope(scopes, 'qq-mail:messages:read')
  if (requestMethod === 'GET'
    && /^\/api\/qq-mail\/accounts\/[^/]+\/messages\/[^/]+\/attachments\/[^/]+$/.test(path)) {
    return hasScope(scopes, 'qq-mail:attachments:read')
  }
  if (requestMethod === 'POST' && /^\/api\/qq-mail\/accounts\/[^/]+\/sync$/.test(path)) {
    return hasScope(scopes, 'qq-mail:sync')
  }
  if (requestMethod === 'POST' && /^\/api\/qq-mail\/accounts\/[^/]+\/messages$/.test(path)) {
    return hasScope(scopes, 'qq-mail:messages:send')
  }
  if (requestMethod === 'GET' && path === '/api/microsoft/accounts') {
    return hasScope(scopes, 'microsoft:accounts:read')
  }
  if (requestMethod === 'GET' && (
    path === '/api/microsoft/messages'
    || /^\/api\/microsoft\/accounts\/[^/]+\/messages\/[^/]+$/.test(path)
  )) return hasScope(scopes, 'microsoft:messages:read')
  if (requestMethod === 'GET'
    && /^\/api\/microsoft\/accounts\/[^/]+\/messages\/[^/]+\/attachments\/[^/]+$/.test(path)) {
    return hasScope(scopes, 'microsoft:attachments:read')
  }
  if (requestMethod === 'GET' && /^\/api\/microsoft\/accounts\/[^/]+\/folders$/.test(path)) {
    return hasScope(scopes, 'microsoft:folders:read')
  }
  if (requestMethod === 'POST' && /^\/api\/microsoft\/accounts\/[^/]+\/sync$/.test(path)) {
    return hasScope(scopes, 'microsoft:sync')
  }
  if (requestMethod === 'GET' && path === '/api/naver-mail/accounts') {
    return hasScope(scopes, 'naver-mail:accounts:read')
  }
  if (requestMethod === 'GET' && (
    path === '/api/naver-mail/messages'
    || /^\/api\/naver-mail\/accounts\/[^/]+\/messages\/[^/]+$/.test(path)
  )) return hasScope(scopes, 'naver-mail:messages:read')
  if (requestMethod === 'GET'
    && /^\/api\/naver-mail\/accounts\/[^/]+\/messages\/[^/]+\/attachments\/[^/]+$/.test(path)) {
    return hasScope(scopes, 'naver-mail:attachments:read')
  }
  if (requestMethod === 'POST' && /^\/api\/naver-mail\/accounts\/[^/]+\/sync$/.test(path)) {
    return hasScope(scopes, 'naver-mail:sync')
  }
  if (requestMethod === 'GET' && path === '/api/yandex-mail/accounts') {
    return hasScope(scopes, 'yandex-mail:accounts:read')
  }
  if (requestMethod === 'GET' && (
    path === '/api/yandex-mail/messages'
    || /^\/api\/yandex-mail\/accounts\/[^/]+\/messages\/[^/]+$/.test(path)
  )) return hasScope(scopes, 'yandex-mail:messages:read')
  if (requestMethod === 'GET'
    && /^\/api\/yandex-mail\/accounts\/[^/]+\/messages\/[^/]+\/attachments\/[^/]+$/.test(path)) {
    return hasScope(scopes, 'yandex-mail:attachments:read')
  }
  if (requestMethod === 'POST' && /^\/api\/yandex-mail\/accounts\/[^/]+\/sync$/.test(path)) {
    return hasScope(scopes, 'yandex-mail:sync')
  }
  if (path === '/api/linux-do-mail/account') {
    if (requestMethod === 'GET') return hasScope(scopes, 'linuxdo-mail:account:read')
    if (requestMethod === 'POST' || requestMethod === 'DELETE') {
      return hasScope(scopes, 'linuxdo-mail:account:write')
    }
  }
  if (requestMethod === 'POST' && path === '/api/linux-do-mail/account/verify') {
    return hasScope(scopes, 'linuxdo-mail:account:write')
  }
  if (requestMethod === 'PUT' && path === '/api/linux-do-mail/account/credential') {
    return hasScope(scopes, 'linuxdo-mail:account:write')
  }
  if (requestMethod === 'GET'
    && /^\/api\/linux-do-mail\/(?:inbox|sent)(?:\/[^/]+)?$/.test(path)) {
    return hasScope(scopes, 'linuxdo-mail:messages:read')
  }
  if (requestMethod === 'POST' && path === '/api/linux-do-mail/messages') {
    return hasScope(scopes, 'linuxdo-mail:messages:send')
  }
  return false
}
