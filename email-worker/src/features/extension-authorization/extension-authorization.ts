import { activeUser, createSessionToken, secretsEqual, sha256 } from '../auth/session/auth'
import { clientIp } from '../../shared/http/api-helpers'
import { writeAudit } from '../../shared/audit/audit'
import {
  OFFICIAL_CHROME_EXTENSION_ID,
  isAllowedExtensionClient,
} from '../../app/middleware/origin-policy'
import { officialExtensionEnabled } from '../admin/settings/system-settings'
import { createDeviceSession, type DeviceUserRow } from '../auth/tokens/token-api'
import { EXTENSION_DEVICE_SCOPES } from '../auth/tokens/token-scope'
import type { Env, SessionUser } from '../../app/types'

const CODE_PREFIX = 'om_ac_'
const CODE_SECONDS = 2 * 60
const CLIENT_ID_PATTERN = /^[a-p]{32}$/
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/

interface AuthorizationInput {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
}

interface AuthorizationRow extends DeviceUserRow {
  client_id: string
  redirect_uri: string
  code_challenge: string
  expires_at: number
  used_at: number | null
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function expectedRedirectUri(clientId: string): string {
  return `https://${clientId}.chromiumapp.org/omnimail`
}

function allowedClient(env: Env, clientId: string, officialEnabled: boolean): boolean {
  return isAllowedExtensionClient(clientId, env.APP_ORIGINS, officialEnabled)
}

export function validAuthorizationInput(
  env: Env,
  input: Partial<AuthorizationInput>,
  officialEnabled = false,
): input is AuthorizationInput {
  return typeof input.clientId === 'string'
    && CLIENT_ID_PATTERN.test(input.clientId)
    && allowedClient(env, input.clientId, officialEnabled)
    && input.redirectUri === expectedRedirectUri(input.clientId)
    && typeof input.state === 'string'
    && STATE_PATTERN.test(input.state)
    && typeof input.codeChallenge === 'string'
    && CHALLENGE_PATTERN.test(input.codeChallenge)
}

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return base64Url(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  ))
}

export async function issueExtensionAuthorization(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  if (request.headers.get('Origin') !== new URL(request.url).origin) {
    return json({ error: '请从 OmniMail 网站确认扩展授权。' }, 403)
  }
  const input = await request.json<Partial<AuthorizationInput>>()
    .catch(() => ({} as Partial<AuthorizationInput>))
  const officialEnabled = input.clientId === OFFICIAL_CHROME_EXTENSION_ID
    ? await officialExtensionEnabled(env.DB)
    : false
  if (!validAuthorizationInput(env, input, officialEnabled)) {
    return json({ error: '扩展授权请求无效或扩展尚未被允许。' }, 400)
  }
  const code = `${CODE_PREFIX}${createSessionToken()}`
  const now = Math.floor(Date.now() / 1000)
  await env.DB.prepare(
    `INSERT INTO extension_authorization_codes (
      code_hash, user_id, client_id, redirect_uri, code_challenge, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    await sha256(code),
    user.id,
    input.clientId,
    input.redirectUri,
    input.codeChallenge,
    now + CODE_SECONDS,
  ).run()
  await writeAudit(env, user.id, 'auth.extension.authorize', user.id, clientIp(request.headers), {
    clientId: input.clientId,
  })
  const redirect = new URL(input.redirectUri)
  redirect.searchParams.set('code', code)
  redirect.searchParams.set('state', input.state)
  return json({ redirectTo: redirect.toString() })
}

function validExchangeOrigin(request: Request, clientId: string): boolean {
  return request.headers.get('Origin') === `chrome-extension://${clientId}`
}

export async function exchangeExtensionAuthorization(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = await request.json<{
    code?: unknown
    codeVerifier?: unknown
    clientId?: unknown
    redirectUri?: unknown
  }>().catch(() => ({} as {
    code?: unknown
    codeVerifier?: unknown
    clientId?: unknown
    redirectUri?: unknown
  }))
  const code = typeof body.code === 'string' ? body.code : ''
  const verifier = typeof body.codeVerifier === 'string' ? body.codeVerifier : ''
  const clientId = typeof body.clientId === 'string' ? body.clientId : ''
  const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri : ''
  const officialEnabled = clientId === OFFICIAL_CHROME_EXTENSION_ID
    ? await officialExtensionEnabled(env.DB)
    : false
  if (
    !code.startsWith(CODE_PREFIX)
    || code.length > 160
    || !VERIFIER_PATTERN.test(verifier)
    || !CLIENT_ID_PATTERN.test(clientId)
    || !allowedClient(env, clientId, officialEnabled)
    || redirectUri !== expectedRedirectUri(clientId)
    || !validExchangeOrigin(request, clientId)
  ) return json({ error: '扩展授权码无效，请重新授权。' }, 401)

  const row = await env.DB.prepare(
    `SELECT c.client_id, c.redirect_uri, c.code_challenge, c.expires_at, c.used_at,
            u.id, u.email, u.display_name, u.role, u.status,
            u.mailbox_limit, u.storage_quota_bytes, u.storage_used_bytes,
            u.can_create_mailboxes, u.can_reply, u.can_translate,
            u.temporary_expires_at, u.deleted_at
       FROM extension_authorization_codes c
       JOIN users u ON u.id = c.user_id
      WHERE c.code_hash = ?`,
  ).bind(await sha256(code)).first<AuthorizationRow>()
  const now = Math.floor(Date.now() / 1000)
  if (
    !row
    || row.used_at !== null
    || row.expires_at <= now
    || row.client_id !== clientId
    || row.redirect_uri !== redirectUri
    || !activeUser(row, now)
    || !await secretsEqual(await pkceChallenge(verifier), row.code_challenge)
  ) return json({ error: '扩展授权码无效或已经过期，请重新授权。' }, 401)

  const consumed = await env.DB.prepare(
    `UPDATE extension_authorization_codes SET used_at = ?
      WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`,
  ).bind(now, await sha256(code), now).run()
  if (!consumed.meta.changes) {
    return json({ error: '扩展授权码已经使用，请重新授权。' }, 401)
  }
  const response = await createDeviceSession(
    env,
    row,
    'OmniMail Float',
    EXTENSION_DEVICE_SCOPES,
  )
  if (response.ok) {
    await writeAudit(env, row.id, 'auth.token.issue', row.id, clientIp(request.headers), {
      channel: 'extension', clientId,
    })
  }
  return response
}
