import type { User } from '../../src/shared/api/api-types'
import {
  authorizationCode,
  extensionAuthorizationUrl,
  pkceChallenge,
  randomAuthorizationValue,
} from './authorization'
import {
  clearPersistentAuth,
  loadPersistentAuth,
  savePersistentAuth,
} from './auth-storage'
import type { ExtensionRequest } from './protocol'
import { extensionApiCall } from './extension-api'
import { hasIndexedSourceScopes } from './mail-source-background'
import { handleChromeNotificationClick } from './notification-navigation'
import { normalizedNotificationSettings } from './notification-settings'
import { runMailPoll } from './notification-poll'

const MAIL_ALARM = 'omnimail-mail-poll'
const LOCAL_SETTINGS = [
  'apiOrigin',
  'knownMessageIds',
  'knownMessageKeys',
  'knownNotificationSources',
  'notificationTargets',
  'notificationsEnabled',
  'notificationSources',
  'quietHoursStart',
  'quietHoursEnd',
  'floatingEnabled',
  'theme',
] as const
const SESSION_AUTH = [
  'accessToken',
  'accessExpiresAt',
  'refreshToken',
  'refreshExpiresAt',
  'scopes',
  'user',
] as const
const ACCESS_REFRESH_MARGIN_MS = 30_000
const ICLOUD_SCOPES = [
  'icloud:accounts:read',
  'icloud:aliases:read',
  'icloud:aliases:create',
  'icloud:messages:read',
] as const

interface TokenResponse {
  accessToken: string
  expiresIn: number
  refreshToken: string
  refreshExpiresIn: number
  scopes: string[]
  user: User
}

interface SessionAuth {
  accessToken?: string
  accessExpiresAt?: number
  refreshToken?: string
  refreshExpiresAt?: number
  scopes?: string[]
  user?: User
}

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

let refreshPromise: Promise<SessionAuth> | null = null

function normalizeApiOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('请输入有效的 OmniMail 地址。')
  }
  const localHttp = url.protocol === 'http:'
    && ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('OmniMail 地址必须使用 HTTPS；本地开发可使用 localhost。')
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('请输入 OmniMail 站点根地址，不要包含路径、参数或账号信息。')
  }
  return url.origin
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) {
    throw new RequestError(body.error || `请求失败（${response.status}）`, response.status)
  }
  return body
}

async function publicRequest<T>(
  apiOrigin: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15_000),
  })
  return parseResponse<T>(response)
}

async function saveTokens(tokens: TokenResponse): Promise<SessionAuth> {
  const refreshExpiresAt = Date.now() + tokens.refreshExpiresIn * 1000
  const auth: SessionAuth = {
    accessToken: tokens.accessToken,
    accessExpiresAt: Date.now() + tokens.expiresIn * 1000,
    refreshToken: tokens.refreshToken,
    refreshExpiresAt,
    scopes: tokens.scopes,
    user: tokens.user,
  }
  await savePersistentAuth({
    refreshToken: tokens.refreshToken,
    refreshExpiresAt,
    scopes: tokens.scopes,
    user: tokens.user,
  })
  await chrome.storage.session.set(auth)
  return auth
}

async function clearAuth(): Promise<void> {
  await Promise.all([
    chrome.storage.session.remove([...SESSION_AUTH]),
    clearPersistentAuth(),
  ])
  await chrome.action.setBadgeText({ text: '' })
}

async function loadAuth(): Promise<SessionAuth> {
  const [session, persistent] = await Promise.all([
    chrome.storage.session.get([...SESSION_AUTH]) as Promise<SessionAuth>,
    loadPersistentAuth(),
  ])
  if (persistent && persistent.refreshExpiresAt <= Date.now()) {
    await Promise.all([
      chrome.storage.session.remove([...SESSION_AUTH]),
      clearPersistentAuth(),
    ])
    return {}
  }
  return {
    ...session,
    refreshToken: persistent?.refreshToken || session.refreshToken,
    refreshExpiresAt: persistent?.refreshExpiresAt || session.refreshExpiresAt,
    scopes: persistent?.scopes || session.scopes,
    user: persistent?.user || session.user,
  }
}

function hasICloudScopes(scopes: string[] | undefined): boolean {
  return ICLOUD_SCOPES.every((scope) => scopes?.includes(scope))
}

async function refreshAuth(): Promise<SessionAuth> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const [settings, auth] = await Promise.all([
      chrome.storage.local.get(['apiOrigin']),
      loadAuth(),
    ])
    const apiOrigin = typeof settings.apiOrigin === 'string' ? settings.apiOrigin : ''
    if (!apiOrigin || !auth.refreshToken) throw new RequestError('请重新登录。', 401)
    try {
      const tokens = await publicRequest<TokenResponse>(
        apiOrigin,
        '/api/auth/token/refresh',
        { method: 'POST', body: JSON.stringify({ refreshToken: auth.refreshToken }) },
      )
      return saveTokens(tokens)
    } catch (error) {
      if (error instanceof RequestError && error.status === 401) await clearAuth()
      throw error
    }
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const settings = await chrome.storage.local.get(['apiOrigin'])
  if (!settings.apiOrigin) throw new RequestError('请先设置 OmniMail 地址。', 401)
  let auth = await loadAuth()
  if (!auth.accessToken || !auth.accessExpiresAt || auth.accessExpiresAt < Date.now() + ACCESS_REFRESH_MARGIN_MS) {
    auth = await refreshAuth()
  }

  const run = async (accessToken: string) => {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${accessToken}`)
    if (typeof init.body === 'string') headers.set('Content-Type', 'application/json')
    return fetch(`${settings.apiOrigin}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(15_000),
    })
  }

  let response = await run(auth.accessToken!)
  if (response.status === 401) {
    auth = await refreshAuth()
    response = await run(auth.accessToken!)
  }
  return response
}

async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return parseResponse<T>(await authenticatedFetch(path, init))
}

function attachmentBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return btoa(binary)
}

async function attachmentPayload(path: string, requestedFilename: string) {
  const response = await authenticatedFetch(path)
  if (!response.ok) return parseResponse<never>(response)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('附件超过 5 MiB 下载上限。')
  const filename = requestedFilename.replace(/[\\/:*?"<>\r\n|]/g, '_').slice(0, 180)
    || 'attachment.bin'
  const contentType = response.headers.get('Content-Type') || 'application/octet-stream'
  return { filename, contentType, contentBase64: attachmentBase64(bytes) }
}

async function apiCall(message: ExtensionRequest): Promise<unknown> {
  return extensionApiCall(
    message,
    authenticatedRequest,
    attachmentPayload,
    async () => (await loadAuth()).scopes,
  )
}

async function authStatus() {
  const [settings, auth] = await Promise.all([
    chrome.storage.local.get(['apiOrigin']),
    loadAuth(),
  ])
  return {
    apiOrigin: String(settings.apiOrigin || ''),
    authenticated: Boolean(auth.refreshToken && auth.user),
    iCloudAuthorized: hasICloudScopes(auth.scopes),
    mailSourcesAuthorized: hasIndexedSourceScopes(auth.scopes),
    user: auth.user || null,
  }
}

async function authorize(message: Extract<ExtensionRequest, { type: 'auth:authorize' }>) {
  const apiOrigin = normalizeApiOrigin(message.apiOrigin)
  const [previousSettings, previousAuth] = await Promise.all([
    chrome.storage.local.get(['apiOrigin']),
    loadAuth(),
  ])
  const previousOrigin = typeof previousSettings.apiOrigin === 'string'
    ? previousSettings.apiOrigin
    : ''
  const clientId = chrome.runtime.id
  const redirectUri = chrome.identity.getRedirectURL('omnimail')
  const state = randomAuthorizationValue()
  const codeVerifier = randomAuthorizationValue()
  const codeChallenge = await pkceChallenge(codeVerifier)
  const url = extensionAuthorizationUrl(apiOrigin, {
    clientId, redirectUri, state, codeChallenge,
  })
  await chrome.storage.local.set({ apiOrigin })
  let callback: string | undefined
  try {
    callback = await chrome.identity.launchWebAuthFlow({ url, interactive: true })
  } catch {
    throw new Error('授权窗口已关闭或授权未完成。')
  }
  const code = authorizationCode(callback, redirectUri, state)
  const tokens = await publicRequest<TokenResponse>(apiOrigin, '/api/auth/extension/exchange', {
    method: 'POST',
    body: JSON.stringify({
      code,
      codeVerifier,
      clientId,
      redirectUri,
    }),
  })
  await chrome.storage.local.remove([
    'knownMessageIds', 'knownMessageKeys', 'knownNotificationSources', 'notificationTargets',
  ])
  await saveTokens(tokens)
  if (previousOrigin && previousAuth.refreshToken
    && previousAuth.refreshToken !== tokens.refreshToken) {
    try {
      await publicRequest(previousOrigin, '/api/auth/token/revoke', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: previousAuth.refreshToken }),
      })
    } catch {
      // The new authorization remains valid if the old session is already unavailable.
    }
  }
  await configureMailAlarm()
  return {
    apiOrigin,
    authenticated: true,
    iCloudAuthorized: hasICloudScopes(tokens.scopes),
    mailSourcesAuthorized: hasIndexedSourceScopes(tokens.scopes),
    user: tokens.user,
  }
}

async function logout() {
  const [settings, auth] = await Promise.all([
    chrome.storage.local.get(['apiOrigin']),
    loadAuth(),
  ])
  const apiOrigin = typeof settings.apiOrigin === 'string' ? settings.apiOrigin : ''
  try {
    if (apiOrigin && auth.refreshToken) {
      await publicRequest(apiOrigin, '/api/auth/token/revoke', {
        method: 'POST', body: JSON.stringify({ refreshToken: auth.refreshToken }),
      })
    }
  } catch {
    // Local logout must still succeed when the server is temporarily unreachable.
  } finally {
    await clearAuth()
    await chrome.alarms.clear(MAIL_ALARM)
    await chrome.storage.local.remove([
      'knownMessageIds', 'knownMessageKeys', 'knownNotificationSources', 'notificationTargets',
    ])
  }
  return { ok: true as const }
}

async function fillCurrentPage(email: string, sender: chrome.runtime.MessageSender) {
  const tabId = sender.tab?.id ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
  if (!tabId) throw new Error('没有可填入的活动网页。')
  const response = await chrome.tabs.sendMessage(tabId, { type: 'omnimail:fill-email', email })
  if (!response?.ok) throw new Error(response?.error || '当前页面没有可用的邮箱输入框。')
  return { ok: true as const }
}

function isTrustedPanel(sender: chrome.runtime.MessageSender): boolean {
  if (!sender.url) return false
  try {
    const url = new URL(sender.url)
    return url.protocol === 'chrome-extension:'
      && url.hostname === chrome.runtime.id
      && url.pathname.endsWith('/panel.html')
  } catch {
    return false
  }
}

async function handleMessage(message: ExtensionRequest, sender: chrome.runtime.MessageSender) {
  if (!isTrustedPanel(sender)) throw new Error('拒绝未授权的扩展消息。')
  if (message.type.startsWith('api:')) return apiCall(message)
  switch (message.type) {
    case 'auth:status': return authStatus()
    case 'auth:authorize': return authorize(message)
    case 'auth:logout': return logout()
    case 'page:fill-email': return fillCurrentPage(message.email, sender)
    case 'settings:get': {
      const settings = await chrome.storage.local.get([
        'floatingEnabled', 'theme', 'notificationsEnabled', 'notificationSources',
        'quietHoursStart', 'quietHoursEnd',
      ])
      return {
        floatingEnabled: settings.floatingEnabled !== false,
        theme: settings.theme === 'light' || settings.theme === 'dark'
          ? settings.theme
          : 'system',
        ...normalizedNotificationSettings(settings),
      }
    }
    case 'settings:set-floating':
      await chrome.storage.local.set({ floatingEnabled: message.enabled })
      return { ok: true as const }
    case 'settings:set-theme':
      if (!['system', 'light', 'dark'].includes(message.theme)) {
        throw new Error('不支持的主题设置。')
      }
      await chrome.storage.local.set({ theme: message.theme })
      return { ok: true as const }
    case 'settings:set-notifications': {
      const settings = normalizedNotificationSettings(message)
      await chrome.storage.local.set(settings)
      if (!settings.notificationsEnabled) {
        await Promise.all([
          chrome.action.setBadgeText({ text: '' }),
          chrome.notifications.getAll().then((items) => Promise.all(
            Object.keys(items).filter((id) => id.startsWith('float:'))
              .map((id) => chrome.notifications.clear(id)),
          )),
        ])
      }
      return { ok: true as const }
    }
    default: throw new Error('不支持的扩展操作。')
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionRequest, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then(sendResponse)
    .catch((error: unknown) => sendResponse({
      error: error instanceof Error ? error.message : '扩展操作失败。',
    }))
  return true
})

function runPollMail(): Promise<void> {
  return runMailPoll(authenticatedRequest, async () => (await loadAuth()).scopes)
}

async function configureMailAlarm(): Promise<void> {
  const auth = await loadAuth()
  await chrome.alarms.clear(MAIL_ALARM)
  if (!auth.refreshToken) return
  await chrome.alarms.create(MAIL_ALARM, { delayInMinutes: 1, periodInMinutes: 1 })
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MAIL_ALARM) void runPollMail().catch(() => {})
})

chrome.notifications.onClicked.addListener((notificationId) => {
  void handleChromeNotificationClick(notificationId)
})

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.get([...LOCAL_SETTINGS]).then((settings) => {
    const defaults: Record<string, unknown> = {}
    if (settings.floatingEnabled === undefined) defaults.floatingEnabled = true
    if (settings.theme === undefined) defaults.theme = 'system'
    if (settings.notificationsEnabled === undefined) defaults.notificationsEnabled = true
    if (settings.notificationSources === undefined) {
      defaults.notificationSources = normalizedNotificationSettings({}).notificationSources
    }
    if (settings.quietHoursStart === undefined) defaults.quietHoursStart = ''
    if (settings.quietHoursEnd === undefined) defaults.quietHoursEnd = ''
    if (Object.keys(defaults).length) return chrome.storage.local.set(defaults)
  })
  void configureMailAlarm()
})

chrome.runtime.onStartup.addListener(() => { void configureMailAlarm() })
void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
