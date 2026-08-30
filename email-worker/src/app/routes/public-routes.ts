import type { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import type { AppContext } from '../context'
import { clearOAuthStateCookie, OAUTH_STATE_COOKIE, setOAuthStateCookie, setSessionCookie } from '../session-cookies'
import { applySuperAdminRole, createSessionToken, sessionFromUser, storeSession } from '../../features/auth/session/auth'
import { authenticatePassword } from '../../features/auth/session/password-login'
import { completeMfaChallenge, createMfaChallenge, mfaEnabled } from '../../features/auth/mfa/mfa'
import { clearMfaChallengeCookie, mfaChallengeCookie, setMfaChallengeCookie } from '../../features/auth/mfa/mfa-cookie'
import { beginLinuxDoAuth, finishLinuxDoAuth } from '../../features/auth/linux-do-auth'
import { registerExternalUser } from '../../features/auth/registration/registration-api'
import { completeSetup } from '../../features/auth/setup/setup-api'
import { issueDeviceToken, refreshDeviceToken, revokeRefreshToken } from '../../features/auth/tokens/token-api'
import { extensionAuthorizationRoutes } from '../../features/extension-authorization/extension-authorization-routes'
import { proxyRemoteImage } from '../../features/messages/remote-image'
import { handleResendWebhook } from '../../features/outbound/resend-webhook'
import { publicConfig } from '../../features/system/public-config'
import { writeAudit } from '../../shared/audit/audit'
import { clientIp } from '../../shared/http/api-helpers'

export function registerPublicRoutes(app: Hono<AppContext>): void {
app.get('/api/health', (context) => context.json({ ok: true }))

app.get('/api/config', async (context) => context.json(await publicConfig(context.env)))

app.get('/api/auth/linux-do', async (context) => {
  const result = await beginLinuxDoAuth(context.env, context.req.raw)
  if (!result.stateCookie) return result.response
  setOAuthStateCookie(context, context.env, result.stateCookie)
  const location = result.response.headers.get('Location')
  if (location) return context.redirect(location, 302)
  return result.response
})

app.get('/api/auth/linux-do/callback', async (context) => {
  const oauthState = getCookie(context, OAUTH_STATE_COOKIE)
  clearOAuthStateCookie(context, context.env)
  const result = await finishLinuxDoAuth(
    context.env,
    context.req.raw,
    clientIp(context.req.raw.headers),
    oauthState,
  )
  if (result.sessionToken) setSessionCookie(context, context.env, result.sessionToken)
  if (result.mfaChallengeToken) {
    setMfaChallengeCookie(context, context.env, result.mfaChallengeToken)
  }
  const location = result.response.headers.get('Location')
  if (location) return context.redirect(location, 302)
  return result.response
})

app.get('/api/remote-images', (context) => proxyRemoteImage(context.req.raw))
app.post('/api/webhooks/resend', (context) => handleResendWebhook(context.env, context.req.raw))

app.post('/api/setup', async (context) => {
  const result = await completeSetup(
    context.env,
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
  if (result.sessionToken) setSessionCookie(context, context.env, result.sessionToken)
  return result.response
})
app.post('/api/login', async (context) => {
  const body = await context.req.json<{
    email?: string
    password?: string
  }>().catch(() => ({} as { email?: string; password?: string }))
  const ip = clientIp(context.req.raw.headers)
  const result = await authenticatePassword(
    context.env.DB,
    body.email || '',
    body.password || '',
    ip,
  )
  if ('error' in result) {
    await writeAudit(
      context.env,
      null,
      'auth.login_failed',
      result.email || null,
      ip,
      { channel: 'browser', reason: result.reason },
    )
    return context.json({ error: result.error }, result.status)
  }
  const { user, email } = result
  if (await mfaEnabled(context.env.DB, user.id)) {
    setMfaChallengeCookie(
      context,
      context.env,
      await createMfaChallenge(context.env.DB, user.id, 'browser'),
    )
    await writeAudit(context.env, user.id, 'auth.mfa.challenge', user.id, ip, { channel: 'browser' })
    return context.json({ mfaRequired: true, email }, 202)
  }
  const token = createSessionToken()
  await storeSession(context.env.DB, user.id, token)
  setSessionCookie(context, context.env, token)
  await writeAudit(context.env, user.id, 'auth.login', user.id, ip, { channel: 'browser' })
  return context.json({
    user: applySuperAdminRole(sessionFromUser(user), context.env.SUPER_ADMIN_EMAIL),
  })
})

app.post('/api/login/mfa', async (context) => {
  const challengeToken = mfaChallengeCookie(context)
  const body = await context.req.json<{ code?: unknown }>().catch(() => ({} as { code?: unknown }))
  const code = typeof body.code === 'string' ? body.code : ''
  const ip = clientIp(context.req.raw.headers)
  const result = await completeMfaChallenge(
    context.env,
    challengeToken,
    code,
    ip,
  )
  if (!result.user) {
    await writeAudit(context.env, null, 'auth.login_failed', null, ip, {
      channel: 'mfa',
      reason: 'invalid_mfa',
    })
    return context.json({ error: result.error || '二次验证失败。' }, 401)
  }
  clearMfaChallengeCookie(context, context.env)
  const token = createSessionToken()
  await storeSession(context.env.DB, result.user.id, token)
  setSessionCookie(context, context.env, token)
  await writeAudit(context.env, result.user.id, 'auth.login', result.user.id, ip, {
    channel: result.channel,
    mfa: true,
    recoveryCode: Boolean(result.recovery),
  })
  return context.json({
    user: applySuperAdminRole(sessionFromUser(result.user), context.env.SUPER_ADMIN_EMAIL),
  })
})

app.post('/api/register', async (context) => {
  const result = await registerExternalUser(context.env, context.req.raw, clientIp(context.req.raw.headers))
  if (result.sessionToken) setSessionCookie(context, context.env, result.sessionToken)
  return result.response
})
app.post('/api/auth/token', (context) => issueDeviceToken(context.env, context.req.raw))
app.post('/api/auth/token/refresh', (context) => refreshDeviceToken(context.env, context.req.raw))
app.post('/api/auth/token/revoke', (context) => revokeRefreshToken(context.env, context.req.raw))
extensionAuthorizationRoutes(app)
}
