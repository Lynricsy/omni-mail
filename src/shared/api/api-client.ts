import { t } from '../i18n'
import type {
  AdminMessageAction,
  AdminMessageDetail,
  AdminMessageFilters,
  AdminMessageSummary,
  AdminUser,
  AdminUserTotals,
  AppConfig,
  AuditCategory,
  AuditDays,
  AuditLog,
  AuditSummary,
  BackupDrillResult,
  BackupObject,
  CreateManagedUser,
  CreateTemporaryInvite,
  DeploymentCheck,
  DraftAttachment,
  DraftSummary,
  Folder,
  MailboxAddress,
  MailboxScope,
  MailCleanupFilter,
  MailCleanupPreview,
  MailCounts,
  MailRefreshInterval,
  MailDraft,
  MailStatistics,
  MfaStatus,
  ManagedDomain,
  ManagedUserPolicy,
  MessageDetail,
  MessageTranslation,
  MessageSummary,
  PageInfo,
  OutboundRateLimitSettings,
  OutboundRateLimitState,
  RegistrationDomainPolicy,
  RegistrationMethod,
  StoragePolicy,
  SystemVersion,
  TemporaryInvite,
  TranslationTargetLanguage,
  User,
} from './api-types'
import type { ExtensionAuthorizationRequest } from '../../features/extension-authorization/model/extensionAuthorization'
import { createICloudApi } from '../../features/icloud/api/icloud-api-client'
import { createLinuxDoMailApi } from '../../features/linux-do-mail/api/linux-do-mail-api-client'
import { createGmailApi } from '../../features/gmail/api/gmail-api-client'
import { createMicrosoftApi } from '../../features/microsoft/api/microsoft-api-client'
import { createQqMailApi } from '../../features/qq-mail/api/qq-mail-api-client'
import { createNaverMailApi } from '../../features/naver-mail/api/naver-mail-api-client'
import { createYandexMailApi } from '../../features/yandex-mail/api/yandex-mail-api-client'
import { createMailApi } from '../../features/mailbox/api/mail-api-client'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '')
const REQUEST_TIMEOUT_MS = 15000
export const AUTH_REQUIRED_EVENT = 'omnimail:auth-required'

type RequestOptions = RequestInit & { timeoutMs?: number }

export async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...requestInit } = init
  const headers = new Headers(requestInit.headers)
  if (requestInit.body && !(requestInit.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  let response: Response
  try {
    const timeout = AbortSignal.timeout(timeoutMs)
    response = await fetch(`${API_ORIGIN}${path}`, {
      ...requestInit,
      headers,
      credentials: 'include',
      signal: requestInit.signal ? AbortSignal.any([requestInit.signal, timeout]) : timeout,
    })
  } catch (error) {
    if (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) {
      throw new ApiError(t('连接超时，请检查网络后重试。'), 408)
    }
    throw error
  }
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT))
    }
    throw new ApiError(
      data.error ? t(data.error) : t('请求失败（{status}）', { status: response.status }),
      response.status,
    )
  }
  return data as T
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value)
}

export const api = {
  config: () => request<AppConfig>('/api/config', { timeoutMs: 30_000 }),
  session: () => request<{ user: User | null }>('/api/session', { timeoutMs: 30_000 }),
  setup: (input: { displayName: string; password: string; setupToken: string }) => (
    request<{ user: User }>('/api/setup', { method: 'POST', body: jsonBody(input) })
  ),
  login: (email: string, password: string) => (
    request<{ user: User } | { mfaRequired: true; email: string }>('/api/login', {
      method: 'POST',
      body: jsonBody({ email, password }),
    })
  ),
  completeMfaLogin: (code: string) => request<{ user: User }>('/api/login/mfa', {
    method: 'POST',
    body: jsonBody({ code }),
  }),
  register: (input: {
    email: string
    displayName: string
    password: string
    turnstileToken: string
  }) => (
    request<{ user: User }>('/api/register', {
      method: 'POST',
      body: jsonBody(input),
    })
  ),
  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),
  authorizeExtension: (input: ExtensionAuthorizationRequest) => (
    request<{ redirectTo: string }>('/api/auth/extension/authorize', {
      method: 'POST', body: jsonBody(input),
    })
  ),
  deploymentCheck: () => request<DeploymentCheck>('/api/admin/deployment-check'),
  systemVersion: () => request<SystemVersion>('/api/admin/version'),
  updateRegistrationSetting: (enabled: boolean, method: RegistrationMethod) => (
    request<{ registrationEnabled: boolean; registrationMethod: RegistrationMethod }>('/api/admin/settings/registration', {
      method: 'PATCH',
      body: jsonBody({ enabled, method }),
    })
  ),
  linuxDoLoginUrl: (returnTo: string) => (
    `${API_ORIGIN}/api/auth/linux-do?returnTo=${encodeURIComponent(returnTo)}`
  ),
  updateRegistrationDomainPolicy: (policy: RegistrationDomainPolicy) => (
    request<{ registrationDomainPolicy: RegistrationDomainPolicy }>(
      '/api/admin/settings/registration-domains',
      {
        method: 'PATCH',
        body: jsonBody(policy),
      },
    )
  ),
  updateMailRefreshInterval: (interval: MailRefreshInterval) => (
    request<{ mailRefreshInterval: MailRefreshInterval }>('/api/admin/settings/mail-refresh', {
      method: 'PATCH',
      body: jsonBody({ interval }),
    })
  ),
  updateMailWorkspaceSettings: (settings: {
    iCloudWorkspaceEnabled: boolean
    linuxDoMailWorkspaceEnabled: boolean
    gmailWorkspaceEnabled: boolean
    microsoftWorkspaceEnabled: boolean
    qqMailWorkspaceEnabled: boolean
    naverMailWorkspaceEnabled: boolean
    yandexMailWorkspaceEnabled: boolean
  }) => request<{
    iCloudWorkspaceEnabled: boolean
    linuxDoMailWorkspaceEnabled: boolean
    gmailWorkspaceEnabled: boolean
    microsoftWorkspaceEnabled: boolean
    qqMailWorkspaceEnabled: boolean
    naverMailWorkspaceEnabled: boolean
    yandexMailWorkspaceEnabled: boolean
  }>('/api/admin/settings/mail-workspaces', {
    method: 'PATCH',
    body: jsonBody(settings),
  }),
  updateRemoteImagesSetting: (enabled: boolean) => (
    request<{ remoteImagesEnabled: boolean }>('/api/admin/settings/remote-images', {
      method: 'PATCH',
      body: jsonBody({ enabled }),
    })
  ),
  updateUnassignedMailSetting: (enabled: boolean) => (
    request<{ unassignedMailEnabled: boolean }>('/api/admin/settings/unassigned-mail', {
      method: 'PATCH',
      body: jsonBody({ enabled }),
    })
  ),
  updateOfficialExtensionSetting: (enabled: boolean) => (
    request<{ officialExtensionEnabled: boolean }>(
      '/api/admin/settings/official-extension',
      { method: 'PATCH', body: jsonBody({ enabled }) },
    )
  ),
  updateRandomMailboxPrefix: (prefix: string) => (
    request<{ randomMailboxPrefix: string }>(
      '/api/admin/settings/random-mailbox-prefix',
      { method: 'PATCH', body: jsonBody({ prefix }) },
    )
  ),
  outboundRateLimitSettings: () => request<{
    outboundRateLimit: OutboundRateLimitSettings
  }>('/api/admin/settings/outbound-rate-limit'),
  updateOutboundRateLimitSettings: (input: OutboundRateLimitSettings) => request<{
    outboundRateLimit: OutboundRateLimitSettings
  }>('/api/admin/settings/outbound-rate-limit', {
    method: 'PATCH',
    body: jsonBody(input),
  }),
  storagePolicy: () => request<{ storagePolicy: StoragePolicy }>(
    '/api/admin/settings/storage',
  ),
  updateStoragePolicy: (storagePolicy: Pick<
    StoragePolicy,
    | 'backupEnabled'
    | 'trashRetentionDays'
    | 'temporaryDataRetentionDays'
    | 'auditRetentionDays'
    | 'failedMessageRetentionDays'
    | 'defaultUserQuotaMiB'
    | 'defaultTemporaryQuotaMiB'
    | 'draftLimits'
  >) => request<{ storagePolicy: StoragePolicy }>('/api/admin/settings/storage', {
    method: 'PATCH',
    body: jsonBody(storagePolicy),
  }),
  startBackup: () => request<{ id: string }>('/api/admin/backups', {
    method: 'POST',
  }),
  backupObjects: (prefix: string, cursor?: string) => {
    const search = new URLSearchParams({ prefix, limit: '30' })
    if (cursor) search.set('cursor', cursor)
    return request<{
      prefix: string
      objects: BackupObject[]
      page: { hasMore: boolean; nextCursor: string | null }
    }>(`/api/admin/backups/objects?${search}`)
  },
  backupDownloadUrl: (key: string) => (
    `${API_ORIGIN}/api/admin/backups/download?key=${encodeURIComponent(key)}`
  ),
  runBackupDrill: (key: string) => request<{ result: BackupDrillResult }>(
    '/api/admin/backups/drill',
    { method: 'POST', body: jsonBody({ key }) },
  ),
  updateAccount: (input: {
    displayName?: string
    currentPassword?: string
    newPassword?: string
  }) => request<{ user: User }>('/api/account', {
    method: 'PATCH',
    body: jsonBody(input),
  }),
  mfaStatus: () => request<MfaStatus>('/api/account/mfa'),
  startMfaSetup: () => request<{ secret: string; uri: string }>('/api/account/mfa/setup', {
    method: 'POST',
  }),
  confirmMfaSetup: (code: string) => request<{
    enabled: true
    recoveryCodes: string[]
  }>('/api/account/mfa/confirm', {
    method: 'POST',
    body: jsonBody({ code }),
  }),
  disableMfa: (code: string) => request<{ enabled: false }>('/api/account/mfa', {
    method: 'DELETE',
    body: jsonBody({ code }),
  }),
  deleteAccount: (input: {
    currentPassword?: string
    confirmationEmail?: string
  }) => request<{ ok: true }>('/api/account', {
    method: 'DELETE',
    body: jsonBody(input),
  }),
  mailStatistics: (days: 7 | 30 | 90) => request<MailStatistics>(
    `/api/admin/statistics?days=${days}`,
  ),
  previewMailCleanup: (filter: MailCleanupFilter) => {
    const search = new URLSearchParams({
      scope: filter.scope,
      scopeValue: filter.scopeValue,
      category: filter.category,
      olderThanDays: String(filter.olderThanDays),
    })
    return request<{
      filter: MailCleanupFilter
      preview: MailCleanupPreview
      batchLimit: number
    }>(`/api/admin/mail-cleanup/preview?${search}`)
  },
  runMailCleanup: (filter: MailCleanupFilter, expectedCount: number) => request<{
    deletedCount: number
    deletedBytes: number
    remainingCount: number
  }>('/api/admin/mail-cleanup', {
    method: 'POST',
    body: jsonBody({ ...filter, expectedCount, confirm: true }),
  }),
  auditLogs: (input: {
    days: AuditDays
    category: AuditCategory
    query: string
    cursor?: string
  }) => {
    const search = new URLSearchParams({
      days: String(input.days),
      category: input.category,
      limit: '50',
    })
    if (input.query) search.set('q', input.query)
    if (input.cursor) search.set('cursor', input.cursor)
    return request<{
      logs: AuditLog[]
      page: PageInfo
      summary: AuditSummary
    }>(`/api/admin/audit-logs?${search}`)
  },
  adminMessages: (input: AdminMessageFilters & { cursor?: string }, signal?: AbortSignal) => {
    const search = new URLSearchParams({
      limit: '30',
      direction: input.direction,
      folder: input.folder,
      status: input.status,
      days: String(input.days),
    })
    if (input.query) search.set('q', input.query)
    if (input.user) search.set('user', input.user)
    if (input.mailbox) search.set('mailbox', input.mailbox)
    if (input.cursor) search.set('cursor', input.cursor)
    return request<{ messages: AdminMessageSummary[]; page: PageInfo }>(
      `/api/admin/messages?${search}`,
      { signal },
    )
  },
  adminMessage: (id: string, signal?: AbortSignal) => request<{
    message: AdminMessageDetail
    thread: AdminMessageSummary[]
  }>(`/api/admin/messages/${encodeURIComponent(id)}`, { signal }),
  manageAdminMessages: (ids: string[], action: AdminMessageAction) => request<{
    ok: true
    updatedCount: number
  }>('/api/admin/messages/bulk', {
    method: 'PATCH',
    body: jsonBody({ ids, action }),
  }),
  adminAttachmentUrl: (messageId: string, attachmentId: string) => (
    `${API_ORIGIN}/api/admin/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
  ),
  adminAttachmentPreviewUrl: (messageId: string, attachmentId: string) => (
    `${API_ORIGIN}/api/admin/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}?preview=1`
  ),
  adminRawUrl: (messageId: string) => (
    `${API_ORIGIN}/api/admin/messages/${encodeURIComponent(messageId)}/raw`
  ),
  adminUsers: (cursor?: string) => {
    const search = new URLSearchParams({ limit: '50' })
    if (cursor) search.set('cursor', cursor)
    return request<{
      users: AdminUser[]
      page: PageInfo
      totals: AdminUserTotals
    }>(`/api/admin/users?${search}`)
  },
  createAdminUser: (input: CreateManagedUser) => (
    request<{ user: AdminUser }>('/api/admin/users', {
      method: 'POST',
      body: jsonBody(input),
    })
  ),
  updateAdminUser: (id: string, input: ManagedUserPolicy) => (
    request<{ user: AdminUser }>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: jsonBody(input),
    })
  ),
  updateUserOutboundRateLimit: (
    id: string,
    input: { minuteLimit: number | null; dayLimit: number | null },
  ) => request<{ outboundRateLimit: OutboundRateLimitState }>(
    `/api/admin/users/${id}/outbound-rate-limit`,
    { method: 'PATCH', body: jsonBody(input) },
  ),
  resetUserOutboundRateLimit: (id: string) => request<{
    outboundRateLimit: OutboundRateLimitState
  }>(`/api/admin/users/${id}/outbound-rate-limit/reset`, { method: 'POST' }),
  domains: () => request<{ domains: ManagedDomain[] }>('/api/domains'),
  createDomain: (name: string) => request<{ domain: ManagedDomain }>('/api/admin/domains', {
    method: 'POST',
    body: jsonBody({ name }),
  }),
  updateDomain: (name: string, isActive: boolean) => (
    request<{ domain: ManagedDomain }>(`/api/admin/domains/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: jsonBody({ isActive }),
    })
  ),
  deleteDomain: (name: string) => request<{ ok: true }>(
    `/api/admin/domains/${encodeURIComponent(name)}`,
    { method: 'DELETE' },
  ),
  temporaryInvites: (cursor?: string) => {
    const search = new URLSearchParams({ limit: '30' })
    if (cursor) search.set('cursor', cursor)
    return request<{ invites: TemporaryInvite[]; page: PageInfo }>(
      `/api/admin/invites?${search}`,
    )
  },
  createTemporaryInvite: (input: CreateTemporaryInvite) => (
    request<{ invite: TemporaryInvite; token: string }>('/api/admin/invites', {
      method: 'POST',
      body: jsonBody(input),
    })
  ),
  revokeTemporaryInvite: (id: string) => request<{ ok: true }>(
    `/api/admin/invites/${id}/revoke`,
    { method: 'PATCH' },
  ),
  temporaryInvite: (token: string) => request<{ invite: TemporaryInvite }>(
    `/api/invitations/${encodeURIComponent(token)}`,
  ),
  registerTemporaryInvite: (
    token: string,
    input: {
      displayName: string
      localPart?: string
      password: string
      turnstileToken?: string
    },
  ) => request<{ email: string }>(`/api/invitations/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: jsonBody(input),
  }),
  ...createMailApi(request, jsonBody, API_ORIGIN),
  ...createICloudApi(request, jsonBody),
  ...createLinuxDoMailApi(request, jsonBody),
  ...createGmailApi(request, jsonBody),
  ...createMicrosoftApi(request, jsonBody),
  ...createQqMailApi(request, jsonBody),
  ...createNaverMailApi(request, jsonBody),
  ...createYandexMailApi(request, jsonBody),
}
