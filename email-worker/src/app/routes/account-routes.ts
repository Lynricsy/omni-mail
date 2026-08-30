import type { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import type { AppContext } from '../context'
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from '../session-cookies'
import { deleteAccount, updateAccount } from '../../features/auth/account/account-api'
import { confirmMfaSetup, disableMfa, mfaStatus, startMfaSetup } from '../../features/auth/mfa/mfa-api'
import { applySuperAdminRole, deleteSession, sessionUser } from '../../features/auth/session/auth'
import { authenticateAccessToken, bearerToken, listDevices, revokeDevice } from '../../features/auth/tokens/token-api'
import { writeAudit } from '../../shared/audit/audit'
import { clientIp } from '../../shared/http/api-helpers'
import { recordClientError } from '../../features/observability/client-error-api'

export function registerAccountRoutes(app: Hono<AppContext>): void {
app.get('/api/session', async (context) => {
  const authorization = bearerToken(context.req.header('Authorization'))
  if (authorization === null) {
    return context.json({ error: 'Authorization 请求头无效。' }, 401)
  }
  if (authorization) {
    const identity = await authenticateAccessToken(context.env, authorization)
    if (!identity) {
      return context.json({ error: '访问令牌已失效，请刷新或重新登录。' }, 401)
    }
    return context.json({ user: identity.user })
  }
  const token = getCookie(context, SESSION_COOKIE)
  const session = token ? await sessionUser(context.env.DB, token) : null
  const user = session
    ? applySuperAdminRole(session, context.env.SUPER_ADMIN_EMAIL)
    : null
  if (!session) clearSessionCookie(context, context.env)
  return context.json({ user })
})
app.post('/api/client-errors', (context) => recordClientError(
  context.req.raw,
  context.get('user'),
  context.get('authKind'),
))

app.post('/api/logout', async (context) => {
  const user = context.get('user')
  const authKind = context.get('authKind')
  if (authKind === 'bearer') {
    await context.env.DB.prepare(
      'UPDATE device_sessions SET revoked_at = unixepoch() WHERE id = ?',
    ).bind(context.get('deviceSessionId')).run()
  } else {
    const token = getCookie(context, SESSION_COOKIE)
    if (token) await deleteSession(context.env.DB, token)
  }
  await writeAudit(
    context.env,
    user.id,
    'auth.logout',
    user.id,
    clientIp(context.req.raw.headers),
    { channel: authKind },
  )
  clearSessionCookie(context, context.env)
  return context.json({ ok: true })
})
app.get('/api/auth/devices', (context) => (
  listDevices(context.env, context.get('user'), context.get('deviceSessionId'))
))
app.delete('/api/auth/devices/:id', (context) => revokeDevice(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
app.patch('/api/account', async (context) => {
  const response = await updateAccount(
    context.env,
    context.get('user'),
    context.req.raw,
    clientIp(context.req.raw.headers),
    context.get('authKind') === 'cookie' ? getCookie(context, SESSION_COOKIE) : undefined,
  )
  const replacement = response.headers.get('X-OmniMail-Replacement-Session')
  if (replacement) {
    response.headers.delete('X-OmniMail-Replacement-Session')
    setSessionCookie(context, context.env, replacement)
  }
  return response
})
app.get('/api/account/mfa', (context) => mfaStatus(context.env, context.get('user')))
app.post('/api/account/mfa/setup', (context) => startMfaSetup(context.env, context.get('user')))
app.post('/api/account/mfa/confirm', (context) => confirmMfaSetup(
  context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers),
))
app.delete('/api/account/mfa', (context) => disableMfa(
  context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers),
))
app.delete('/api/account', async (context) => {
  const response = await deleteAccount(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers))
  if (response.ok) clearSessionCookie(context, context.env)
  return response
})
}
