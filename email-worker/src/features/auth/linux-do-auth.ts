import {
  activeUser,
  createSessionToken,
  secretsEqual,
  sessionFromUser,
  storeSession,
} from './session/auth'
import { writeAudit } from '../../shared/audit/audit'
import { isAllowedOrigin } from '../../app/middleware/origin-policy'
import { createMfaChallenge, mfaEnabled } from './mfa/mfa'
import {
  externalRegistrationEnabled,
  externalRegistrationMethod,
  linuxDoAuthReady,
} from './registration/registration-api'
import { defaultQuotaBytes } from '../admin/settings/storage-policy'
import type { Env, SessionUser, UserRow } from '../../app/types'

const PROVIDER = 'linuxdo'
const AUTHORIZE_URL = 'https://connect.linux.do/oauth2/authorize'
const TOKEN_URLS = [
  'https://connect.linux.do/oauth2/token',
  'https://connect.linuxdo.org/oauth2/token',
]
const USER_URLS = [
  'https://connect.linux.do/api/user',
  'https://connect.linuxdo.org/api/user',
]
const STATE_SECONDS = 10 * 60

type LinuxDoProfile = {
  subject: string
  username: string
  displayName: string
  avatarUrl: string | null
}

type LinkedUser = Pick<
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

export function parseLinuxDoProfile(input: unknown): LinuxDoProfile | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  const subject = typeof value.id === 'number' && Number.isSafeInteger(value.id)
    ? String(value.id)
    : typeof value.id === 'string' ? value.id.trim() : ''
  const username = typeof value.username === 'string' ? value.username.trim() : ''
  if (!/^\d{1,30}$/.test(subject) || !/^[a-zA-Z0-9_.-]{1,60}$/.test(username)) return null
  if (value.active !== true) return null
  const suppliedName = typeof value.name === 'string' ? value.name : ''
  const displayName = (suppliedName || username)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 60) || username
  let avatarUrl: string | null = null
  if (typeof value.avatar_template === 'string') {
    try {
      const avatar = new URL(value.avatar_template.replace('{size}', '120'))
      if (avatar.protocol === 'https:') avatarUrl = avatar.toString()
    } catch {
      // Avatar metadata is optional and never affects authentication.
    }
  }
  return { subject, username, displayName, avatarUrl }
}

function callbackUrl(request: Request): string {
  return new URL('/api/auth/linux-do/callback', request.url).toString()
}

function safeReturnUrl(env: Env, request: Request): string {
  const fallback = new URL(request.url).origin
  const requested = new URL(request.url).searchParams.get('returnTo')?.trim()
  if (!requested || !isAllowedOrigin(requested, request.url, env.APP_ORIGINS)) return fallback
  const destination = new URL(requested)
  if (destination.username || destination.password) return fallback
  destination.hash = ''
  return destination.pathname === '/' && !destination.search
    ? destination.origin
    : destination.toString()
}

function redirectToApp(returnTo: string, failed = false, mfaRequired = false): Response {
  const destination = new URL(returnTo)
  if (failed) destination.searchParams.set('auth_error', PROVIDER)
  if (mfaRequired) destination.searchParams.set('mfa_required', '1')
  return Response.redirect(destination.toString(), 302)
}

function stateCookie(state: string, returnOrigin: string, expiresAt: number): string {
  const encodedOrigin = btoa(returnOrigin)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  return `${state}.${encodedOrigin}.${expiresAt}`
}

function decodeOrigin(value: string): string {
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=')
    return atob(base64)
  } catch {
    return ''
  }
}

export async function beginLinuxDoAuth(
  env: Env,
  request: Request,
): Promise<{ response: Response; stateCookie?: string }> {
  if (!linuxDoAuthReady(env)) {
    return {
      response: Response.json({ error: 'Linux DO Connect 尚未配置。' }, { status: 503 }),
    }
  }
  const state = createSessionToken()
  const returnOrigin = safeReturnUrl(env, request)
  const expiresAt = Math.floor(Date.now() / 1000) + STATE_SECONDS
  const authorization = new URL(AUTHORIZE_URL)
  authorization.searchParams.set('client_id', env.LINUX_DO_CLIENT_ID!.trim())
  authorization.searchParams.set('response_type', 'code')
  authorization.searchParams.set('redirect_uri', callbackUrl(request))
  authorization.searchParams.set('state', state)
  return {
    response: Response.redirect(authorization.toString(), 302),
    stateCookie: stateCookie(state, returnOrigin, expiresAt),
  }
}

async function consumeState(
  env: Env,
  request: Request,
  suppliedState: string,
  cookie: string,
): Promise<{ return_origin: string } | null> {
  const [expectedState, encodedOrigin, expiresText, ...extra] = cookie.split('.')
  const expiresAt = Number(expiresText)
  if (
    extra.length
    || !/^[a-zA-Z0-9_-]{32,100}$/.test(suppliedState)
    || !/^[a-zA-Z0-9_-]{32,100}$/.test(expectedState || '')
    || !Number.isSafeInteger(expiresAt)
    || expiresAt < Math.floor(Date.now() / 1000)
  ) return null
  if (!await secretsEqual(suppliedState, expectedState)) return null
  const returnOrigin = decodeOrigin(encodedOrigin || '')
  if (!isAllowedOrigin(returnOrigin, request.url, env.APP_ORIGINS)) return null
  const destination = new URL(returnOrigin)
  if (destination.username || destination.password) return null
  destination.hash = ''
  return {
    return_origin: destination.pathname === '/' && !destination.search
      ? destination.origin
      : destination.toString(),
  }
}

async function exchangeProfile(env: Env, request: Request, code: string): Promise<LinuxDoProfile> {
  const credentials = btoa(
    `${env.LINUX_DO_CLIENT_ID!.trim()}:${env.LINUX_DO_CLIENT_SECRET!.trim()}`,
  )
  let accessToken = ''
  for (const tokenUrl of TOKEN_URLS) {
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'OmniMail/0.1',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl(request),
      }),
    })
    const token = await tokenResponse.json<{ access_token?: string }>()
      .catch(() => ({} as { access_token?: string }))
    if (tokenResponse.ok && token.access_token) {
      accessToken = token.access_token
      break
    }
  }
  if (!accessToken) throw new Error('token_exchange_failed')
  for (const userUrl of USER_URLS) {
    const userResponse = await fetch(userUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'OmniMail/0.1',
      },
    })
    const profile = parseLinuxDoProfile(await userResponse.json().catch(() => null))
    if (userResponse.ok && profile) return profile
  }
  throw new Error('invalid_user_profile')
}

async function linkedUser(env: Env, subject: string): Promise<LinkedUser | null> {
  return env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.role, u.status,
            u.mailbox_limit, u.storage_quota_bytes, u.storage_used_bytes,
            u.can_create_mailboxes, u.can_reply, u.can_translate,
            u.temporary_expires_at, u.deleted_at
       FROM oauth_identities oi
       JOIN users u ON u.id = oi.user_id
      WHERE oi.provider = ? AND oi.subject = ?`,
  ).bind(PROVIDER, subject).first<LinkedUser>()
}

async function resolveUser(
  env: Env,
  profile: LinuxDoProfile,
): Promise<{ user: SessionUser; created: boolean } | null> {
  let row = await linkedUser(env, profile.subject)
  let created = false
  if (!row) {
    if (
      !await externalRegistrationEnabled(env.DB)
      || await externalRegistrationMethod(env.DB) !== 'linuxdo'
    ) return null
    const id = crypto.randomUUID()
    const email = `linuxdo-${profile.subject}@oauth.omnimail.invalid`
    const quota = await defaultQuotaBytes(env.DB, 'user')
    const newUser: LinkedUser = {
      id,
      email,
      display_name: profile.displayName,
      role: 'user',
      status: 'active',
      mailbox_limit: 1,
      storage_quota_bytes: quota,
      storage_used_bytes: 0,
      can_create_mailboxes: 1,
      can_reply: 0,
      can_translate: 1,
      temporary_expires_at: null,
      deleted_at: null,
    }
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO users (
            id, email, display_name, password_hash, role, status, mailbox_limit,
            storage_quota_bytes, can_create_mailboxes, can_reply
          ) VALUES (?, ?, ?, 'external-auth-only', 'user', 'active', 1, ?, 1, 0)`,
        ).bind(id, email, profile.displayName, quota),
        env.DB.prepare(
          `INSERT INTO oauth_identities (
            provider, subject, user_id, username, avatar_url
          ) VALUES (?, ?, ?, ?, ?)`,
        ).bind(PROVIDER, profile.subject, id, profile.username, profile.avatarUrl),
      ])
      created = true
      row = newUser
    } catch {
      row = await linkedUser(env, profile.subject)
      if (!row) throw new Error('identity_creation_failed')
    }
  } else {
    await env.DB.prepare(
      `UPDATE oauth_identities
          SET username = ?, avatar_url = ?, updated_at = unixepoch()
        WHERE provider = ? AND subject = ?`,
    ).bind(profile.username, profile.avatarUrl, PROVIDER, profile.subject).run()
  }
  if (!row || !activeUser(row, Math.floor(Date.now() / 1000))) return null
  return { user: sessionFromUser(row), created }
}

export async function finishLinuxDoAuth(
  env: Env,
  request: Request,
  ip: string,
  oauthStateCookie = '',
): Promise<{ response: Response; sessionToken?: string; mfaChallengeToken?: string }> {
  const url = new URL(request.url)
  const stateRow = await consumeState(
    env,
    request,
    url.searchParams.get('state') || '',
    oauthStateCookie,
  )
  const fallbackOrigin = new URL(request.url).origin
  if (!stateRow) {
    await writeAudit(env, null, 'auth.login_failed', null, ip, {
      channel: PROVIDER,
      reason: 'state_mismatch',
    }).catch(() => undefined)
    return { response: redirectToApp(fallbackOrigin, true) }
  }
  try {
    const code = url.searchParams.get('code') || ''
    if (url.searchParams.has('error') || !code || code.length > 2048) {
      throw new Error('authorization_denied')
    }
    const profile = await exchangeProfile(env, request, code)
    const resolved = await resolveUser(env, profile)
    if (!resolved) throw new Error('registration_closed_or_user_disabled')
    if (await mfaEnabled(env.DB, resolved.user.id)) {
      const mfaChallengeToken = await createMfaChallenge(env.DB, resolved.user.id, 'linuxdo')
      await writeAudit(env, resolved.user.id, 'auth.mfa.challenge', resolved.user.id, ip, {
        channel: PROVIDER,
      })
      return {
        mfaChallengeToken,
        response: redirectToApp(stateRow.return_origin, false, true),
      }
    }
    const sessionToken = createSessionToken()
    await storeSession(env.DB, resolved.user.id, sessionToken)
    await writeAudit(
      env,
      resolved.user.id,
      resolved.created ? 'auth.register' : 'auth.login',
      resolved.user.id,
      ip,
      { channel: PROVIDER, subject: profile.subject },
    )
    return { sessionToken, response: redirectToApp(stateRow.return_origin) }
  } catch (error) {
    await writeAudit(env, null, 'auth.login_failed', null, ip, {
      channel: PROVIDER,
      reason: error instanceof Error ? error.message : 'oauth_failed',
    }).catch(() => undefined)
    return { response: redirectToApp(stateRow.return_origin, true) }
  }
}
