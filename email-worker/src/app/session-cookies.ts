import { deleteCookie, setCookie } from 'hono/cookie'
import { sessionMaxAge } from '../features/auth/session/auth'
import type { Env } from './types'

export const SESSION_COOKIE = 'omnimail_session'
export const OAUTH_STATE_COOKIE = 'omnimail_oauth_state'

export function setSessionCookie(context: Parameters<typeof setCookie>[0], env: Env, token: string): void {
  setCookie(context, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE !== 'false',
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionMaxAge,
  })
}

export function clearSessionCookie(context: Parameters<typeof deleteCookie>[0], env: Env): void {
  deleteCookie(context, SESSION_COOKIE, {
    secure: env.COOKIE_SECURE !== 'false',
    sameSite: 'Lax',
    path: '/',
  })
}

export function setOAuthStateCookie(
  context: Parameters<typeof setCookie>[0],
  env: Env,
  value: string,
): void {
  setCookie(context, OAUTH_STATE_COOKIE, value, {
    httpOnly: true,
    secure: env.COOKIE_SECURE !== 'false',
    sameSite: 'Lax',
    path: '/api/auth/linux-do',
    maxAge: 10 * 60,
  })
}

export function clearOAuthStateCookie(
  context: Parameters<typeof deleteCookie>[0],
  env: Env,
): void {
  deleteCookie(context, OAUTH_STATE_COOKIE, {
    secure: env.COOKIE_SECURE !== 'false',
    sameSite: 'Lax',
    path: '/api/auth/linux-do',
  })
}
