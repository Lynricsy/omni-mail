import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { applySuperAdminRole, createSessionToken, deleteSession, hashPassword, secretsEqual, sessionFromUser, sessionMaxAge, sessionUser, storeSession, validatePassword } from './auth'
import { clientIp, normalizeEmail, validEmail } from './api-helpers'
import { deleteAccount, updateAccount } from './account-api'
import { previewAdminMailCleanup, runAdminMailCleanup } from './admin-mail-cleanup'
import { listAuditLogs } from './audit-log-api'
import { writeAudit } from './audit'
import { createDomain, deleteDomain, listDomains, updateDomain } from './domain-api'
import { deploymentCheck, publicSetupRequirements } from './deployment-check'
import { listFailedMessages, retryFailedMessage } from './failed-mail-api'
import { addMailbox, listMailboxes, updateMailbox } from './mailbox-api'
import { bulkUpdateMessages } from './message-bulk-api'
import { deleteMessage, getMessageAttachment, getMessageDetail, getRawMessage, previewMessageAttachment, updateMessage } from './message-detail-api'
import { listMessages } from './message-list-api'
import { mailFeatureRoutes } from './mail-feature-routes'
import { confirmMfaSetup, disableMfa, mfaStatus, startMfaSetup } from './mfa-api'
import { completeMfaChallenge, createMfaChallenge, mfaEnabled } from './mfa'
import { clearMfaChallengeCookie, mfaChallengeCookie, setMfaChallengeCookie } from './mfa-cookie'
import { beginLinuxDoAuth, finishLinuxDoAuth } from './linux-do-auth'
import { isAllowedOrigin } from './origin-policy'
import { authenticatePassword } from './password-login'
import { publicConfig } from './public-config'
import { proxyRemoteImage } from './remote-image'
import { handleResendWebhook } from './resend-webhook'
import { outboundRateLimitRoutes } from './outbound-rate-limit-routes'
import { externalRegistrationEnabled, registerExternalUser, registrationDomainPolicy, updateExternalRegistration, updateRegistrationDomainPolicy } from './registration-api'
import { registrationProtectionReady } from './registration-security'
import { sendReply } from './reply'
import { sendMessage, type NewMessageInput } from './send-message'
import { ensureSchema } from './schema'
import { mailStatistics } from './statistics-api'
import { startManualBackup, storagePolicy, updateStoragePolicy } from './storage-policy'
import { syncSuperAdminIdentity } from './super-admin-sync'
import { updateMailRefreshInterval, updateRemoteImagesSetting, updateUnassignedMailSetting } from './system-settings'
import { systemVersionRoutes } from './system-version-routes'
import { createTemporaryInvite, listTemporaryInvites, registerTemporaryInvite, revokeTemporaryInvite, temporaryInvitePreview } from './temporary-invite-api'
import { authenticateAccessToken, bearerToken, issueDeviceToken, listDevices, refreshDeviceToken, revokeDevice, revokeRefreshToken } from './token-api'
import { createManagedUser, listManagedUsers, updateManagedUser } from './user-admin-api'
import type { Env, SessionUser } from './types'
const SESSION_COOKIE = 'omnimail_session'
const OAUTH_STATE_COOKIE = 'omnimail_oauth_state'
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/config',
  '/api/setup',
  '/api/login',
  '/api/login/mfa',
  '/api/register',
  '/api/session',
  '/api/auth/token',
  '/api/auth/token/refresh',
  '/api/auth/token/revoke',
  '/api/auth/linux-do',
  '/api/auth/linux-do/callback',
  '/api/webhooks/resend',
])

export type AppContext = {
  Bindings: Env
  Variables: {
    user: SessionUser
    authKind: 'cookie' | 'bearer'
    deviceSessionId?: string
  }
}

const app = new Hono<AppContext>()
function setSessionCookie(context: Parameters<typeof setCookie>[0], env: Env, token: string): void {
  setCookie(context, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE !== 'false',
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionMaxAge,
  })
}

function clearSessionCookie(context: Parameters<typeof deleteCookie>[0], env: Env): void {
  deleteCookie(context, SESSION_COOKIE, {
    secure: env.COOKIE_SECURE !== 'false',
    sameSite: 'Lax',
    path: '/',
  })
}
function setOAuthStateCookie(
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

function clearOAuthStateCookie(
  context: Parameters<typeof deleteCookie>[0],
  env: Env,
): void {
  deleteCookie(context, OAUTH_STATE_COOKIE, {
    secure: env.COOKIE_SECURE !== 'false',
    sameSite: 'Lax',
    path: '/api/auth/linux-do',
  })
}

async function setupComplete(db: D1Database): Promise<boolean> {
  const setting = await db.prepare(
    "SELECT value FROM settings WHERE key = 'setup_complete'",
  ).first<{ value: string }>()
  return setting?.value === '1'
}

function configuredSuperAdminEmail(env: Env): string {
  const email = normalizeEmail(env.SUPER_ADMIN_EMAIL || '')
  return validEmail(email) ? email : ''
}

app.use('*', async (context, next) => {
  const requestOrigin = context.req.header('Origin')
  const originAllowed = isAllowedOrigin(
    requestOrigin,
    context.req.url,
    context.env.APP_ORIGINS,
  )

  if (context.req.method === 'OPTIONS') {
    if (!originAllowed) return context.json({ error: 'Origin is not allowed.' }, 403)
    const response = new Response(null, { status: 204 })
    if (requestOrigin) response.headers.set('Access-Control-Allow-Origin', requestOrigin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    response.headers.set('Access-Control-Max-Age', '86400')
    response.headers.append('Vary', 'Origin')
    return response
  }

  if (!originAllowed) return context.json({ error: 'Origin is not allowed.' }, 403)
  await next()

  if (requestOrigin) context.header('Access-Control-Allow-Origin', requestOrigin)
  context.header('Access-Control-Allow-Credentials', 'true')
  context.header('Vary', 'Origin', { append: true })
  context.header('X-Content-Type-Options', 'nosniff')
  context.header('Referrer-Policy', 'no-referrer')
  context.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  context.header('Content-Security-Policy', context.res.headers.get('Content-Security-Policy') ?? "default-src 'none'; frame-ancestors 'none'")
})

app.use('/api/*', async (context, next) => {
  await ensureSchema(context.env.DB)
  await syncSuperAdminIdentity(context.env, configuredSuperAdminEmail(context.env))
  if (PUBLIC_PATHS.has(context.req.path) || context.req.path.startsWith('/api/invitations/')) {
    await next()
    return
  }

  const authorization = bearerToken(context.req.header('Authorization'))
  if (authorization === null) {
    return context.json({ error: 'Authorization 请求头无效。' }, 401)
  }
  if (authorization) {
    const identity = await authenticateAccessToken(context.env, authorization)
    if (!identity) return context.json({ error: '访问令牌已失效，请刷新或重新登录。' }, 401)
    context.set('user', identity.user)
    context.set('authKind', 'bearer')
    context.set('deviceSessionId', identity.deviceSessionId)
    await next()
    return
  }

  const cookieToken = getCookie(context, SESSION_COOKIE)
  const session = cookieToken ? await sessionUser(context.env.DB, cookieToken) : null
  if (!session) {
    clearSessionCookie(context, context.env)
    return context.json({ error: '请先登录。' }, 401)
  }
  context.set('user', applySuperAdminRole(session, context.env.SUPER_ADMIN_EMAIL))
  context.set('authKind', 'cookie')
  await next()
})

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
  if (await setupComplete(context.env.DB)) {
    return context.json({ error: 'OmniMail 已完成初始化。' }, 409)
  }
  if (!context.env.SETUP_TOKEN) {
    return context.json({ error: '请先在 Worker 中配置 SETUP_TOKEN Secret。' }, 503)
  }
  const email = configuredSuperAdminEmail(context.env)
  if (!email) {
    return context.json({ error: '请先在 Worker 中配置有效的 SUPER_ADMIN_EMAIL。' }, 503)
  }

  const body = await context.req.json<{
    displayName?: string
    password?: string
    setupToken?: string
  }>().catch(() => ({} as {
    displayName?: string
    password?: string
    setupToken?: string
  }))
  const displayName = (body.displayName || '').trim()
  const password = body.password || ''
  const passwordError = validatePassword(password)

  if (!displayName || displayName.length > 60) {
    return context.json({ error: '显示名称需要在 1–60 个字符之间。' }, 400)
  }
  if (passwordError) return context.json({ error: passwordError }, 400)
  if (!await secretsEqual(body.setupToken || '', context.env.SETUP_TOKEN)) {
    return context.json({ error: '初始化令牌不正确。' }, 403)
  }

  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('setup_complete', '1')",
      ),
      context.env.DB.prepare(
        `INSERT INTO users (
          id, email, display_name, password_hash, role, mailbox_limit,
          storage_quota_bytes, can_create_mailboxes, can_reply
        ) VALUES (?, ?, ?, ?, 'super_admin', 100, 5368709120, 1, 1)`,
      ).bind(userId, email, displayName, passwordHash),
    ])
  } catch {
    return context.json({ error: '初始化失败，可能已有管理员账户。' }, 409)
  }

  const token = createSessionToken()
  await storeSession(context.env.DB, userId, token)
  setSessionCookie(context, context.env, token)
  await writeAudit(context.env, userId, 'setup.complete', userId, clientIp(context.req.raw.headers))
  return context.json({
    user: {
      id: userId,
      email,
      displayName,
      role: 'super_admin' as const,
      mailboxLimit: 100,
      storageQuotaBytes: 5368709120,
      storageUsedBytes: 0,
      canCreateMailboxes: true,
      canReply: true, canTranslate: true,
      temporaryExpiresAt: null,
    },
  }, 201)
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
app.patch('/api/account', (context) => updateAccount(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
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
app.get('/api/invitations/:token', (context) => temporaryInvitePreview(context.env, context.req.param('token')))
app.post('/api/invitations/:token', (context) => registerTemporaryInvite(context.env, context.req.param('token'), context.req.raw, clientIp(context.req.raw.headers)))
app.get('/api/admin/invites', (context) => listTemporaryInvites(
  context.env,
  context.get('user'),
  context.req.raw,
))
app.post('/api/admin/invites', (context) => createTemporaryInvite(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/invites/:id/revoke', (context) => revokeTemporaryInvite(context.env, context.get('user'), context.req.param('id'), clientIp(context.req.raw.headers)))
app.get('/api/admin/statistics', (context) => mailStatistics(context.env, context.get('user'), context.req.raw))
app.get('/api/admin/failed-messages', (context) => listFailedMessages(context.env, context.get('user')))
app.post('/api/admin/failed-messages/:id/retry', (context) => retryFailedMessage(
  context.env, context.get('user'), context.req.param('id'), clientIp(context.req.raw.headers),
))
app.get('/api/admin/mail-cleanup/preview', (context) => previewAdminMailCleanup(
  context.env,
  context.get('user'),
  context.req.raw,
))
app.post('/api/admin/mail-cleanup', (context) => runAdminMailCleanup(
  context.env,
  context.get('user'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
app.get('/api/admin/audit-logs', (context) => listAuditLogs(context.env, context.get('user'), context.req.raw))
app.get('/api/admin/deployment-check', (context) => deploymentCheck(context.env, context.get('user')))
app.route('/api', systemVersionRoutes)
app.get('/api/admin/users', (context) => listManagedUsers(
  context.env,
  context.get('user'),
  configuredSuperAdminEmail(context.env),
  context.req.raw,
))
app.post('/api/admin/users', (context) => createManagedUser(
  context.env,
  context.get('user'),
  configuredSuperAdminEmail(context.env),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
app.patch('/api/admin/settings/registration', (context) => updateExternalRegistration(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/settings/registration-domains', (context) => updateRegistrationDomainPolicy(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/settings/mail-refresh', (context) => updateMailRefreshInterval(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/settings/remote-images', (context) => updateRemoteImagesSetting(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/settings/unassigned-mail', (context) => updateUnassignedMailSetting(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.get('/api/admin/settings/storage', async (context) => {
  const user = context.get('user')
  if (user.role !== 'super_admin' && user.role !== 'admin') {
    return context.json({ error: '只有管理员可以查看存储策略。' }, 403)
  }
  return context.json({ storagePolicy: await storagePolicy(context.env) })
})
app.patch('/api/admin/settings/storage', (context) => updateStoragePolicy(
  context.env,
  context.get('user'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
app.post('/api/admin/backups', (context) => startManualBackup(
  context.env,
  context.get('user'),
  clientIp(context.req.raw.headers),
))
app.patch('/api/admin/users/:id', (context) => updateManagedUser(
  context.env,
  context.get('user'),
  configuredSuperAdminEmail(context.env),
  context.req.param('id'),
  context.req.raw,
  clientIp(context.req.raw.headers),
))
app.get('/api/domains', (context) => listDomains(context.env, context.get('user')))
app.post('/api/admin/domains', (context) => createDomain(context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers)))
app.patch('/api/admin/domains/:name', (context) => updateDomain(context.env, context.get('user'), context.req.param('name'), context.req.raw, clientIp(context.req.raw.headers)))
app.delete('/api/admin/domains/:name', (context) => deleteDomain(context.env, context.get('user'), context.req.param('name'), clientIp(context.req.raw.headers)))
app.get('/api/mailboxes', (context) => (
  listMailboxes(context.env, context.get('user'))
))
app.post('/api/mailboxes', (context) => (
  addMailbox(
    context.env,
    context.get('user'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))
app.patch('/api/mailboxes/:address', (context) => (
  updateMailbox(
    context.env,
    context.get('user'),
    context.req.param('address'),
    context.req.raw,
    clientIp(context.req.raw.headers),
  )
))

app.get('/api/messages', (context) => listMessages(context.env, context.get('user'), context.req.raw))
app.route('/api', mailFeatureRoutes)
app.route('/api', outboundRateLimitRoutes)
app.post('/api/messages', async (context) => {
  const body = await context.req.json<NewMessageInput>()
    .catch(() => ({} as NewMessageInput))
  return sendMessage(
    context.env,
    context.get('user'),
    body,
    clientIp(context.req.raw.headers),
  )
})
app.patch('/api/messages/bulk', (context) => bulkUpdateMessages(
  context.env, context.get('user'), context.req.raw, clientIp(context.req.raw.headers),
))

app.get('/api/messages/:id', (context) => getMessageDetail(
  context.env, context.get('user'), context.req.param('id'),
))
app.patch('/api/messages/:id', (context) => updateMessage(
  context.env, context.get('user'), context.req.param('id'), context.req.raw,
))
app.delete('/api/messages/:id', (context) => deleteMessage(
  context.env,
  context.get('user'),
  context.req.param('id'),
  clientIp(context.req.raw.headers),
))
app.get('/api/messages/:messageId/attachments/:attachmentId', (context) => (
  (context.req.query('preview') === '1' ? previewMessageAttachment : getMessageAttachment)(
    context.env,
    context.get('user'),
    context.req.param('messageId'),
    context.req.param('attachmentId'),
  )
))
app.get('/api/messages/:id/raw', (context) => getRawMessage(
  context.env, context.get('user'), context.req.param('id'),
))

app.post('/api/messages/:id/reply', async (context) => {
  const body = await context.req.json<{
    text?: string
    idempotencyKey?: string
  }>().catch(() => ({} as { text?: string; idempotencyKey?: string }))
  return sendReply(
    context.env,
    context.get('user'),
    context.req.param('id'),
    body,
    clientIp(context.req.raw.headers),
  )
})

app.onError((error, context) => {
  console.error(error)
  return context.json({ error: '服务器暂时无法处理这个请求。' }, 500)
})

app.notFound((context) => context.json({ error: '接口不存在。' }, 404))

export const fetchApi = app.fetch
