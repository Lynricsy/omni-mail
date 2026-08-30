import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Env } from '../../../app/types'

const COOKIE = 'omnimail_mfa_challenge'

export function setMfaChallengeCookie(
  context: Parameters<typeof setCookie>[0],
  env: Env,
  token: string,
): void {
  setCookie(context, COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE !== 'false',
    sameSite: 'Lax',
    path: '/api/login/mfa',
    maxAge: 5 * 60,
  })
}

export function clearMfaChallengeCookie(
  context: Parameters<typeof deleteCookie>[0],
  env: Env,
): void {
  deleteCookie(context, COOKIE, {
    secure: env.COOKIE_SECURE !== 'false',
    sameSite: 'Lax',
    path: '/api/login/mfa',
  })
}

export function mfaChallengeCookie(context: Parameters<typeof getCookie>[0]): string {
  return getCookie(context, COOKIE) || ''
}
