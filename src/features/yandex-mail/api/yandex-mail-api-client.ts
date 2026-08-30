import type {
  PageInfo,
  YandexMailAccount,
  YandexMailMessageDetail,
  YandexMailMessageSummary,
} from '../../../shared/api/api-types'

type Request = <T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
) => Promise<T>

export function createYandexMailApi(request: Request, jsonBody: (value: unknown) => string) {
  return {
    yandexMailAccounts: (signal?: AbortSignal) => request<{
      enabled: boolean
      accounts: YandexMailAccount[]
    }>('/api/yandex-mail/accounts', { signal }),
    connectYandexMail: (input: {
      name: string
      email: string
      appPassword: string
    }) => request<{ account: YandexMailAccount }>('/api/yandex-mail/accounts', {
      method: 'POST', body: jsonBody(input), timeoutMs: 30_000,
    }),
    renameYandexMail: (accountId: string, name: string) => request<{
      account: YandexMailAccount
    }>(`/api/yandex-mail/accounts/${encodeURIComponent(accountId)}`, {
      method: 'PATCH', body: jsonBody({ name }),
    }),
    updateYandexMailAppPassword: (accountId: string, appPassword: string) => request<{
      account: YandexMailAccount
    }>(`/api/yandex-mail/accounts/${encodeURIComponent(accountId)}/app-password`, {
      method: 'PUT', body: jsonBody({ appPassword }), timeoutMs: 30_000,
    }),
    verifyYandexMail: (accountId: string) => request<{ ok: true; validatedAt: number }>(
      `/api/yandex-mail/accounts/${encodeURIComponent(accountId)}/verify`,
      { method: 'POST', timeoutMs: 30_000 },
    ),
    disconnectYandexMail: (accountId: string) => request<{
      ok: true
      remoteRevocationRequired: true
    }>(`/api/yandex-mail/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' }),
    syncYandexMail: (accountId: string) => request<{ queued: true }>(
      `/api/yandex-mail/accounts/${encodeURIComponent(accountId)}/sync`,
      { method: 'POST', timeoutMs: 30_000 },
    ),
    yandexMailMessages: (accountId = '', cursor = '', query = '', signal?: AbortSignal) => {
      const search = new URLSearchParams({ limit: '30' })
      if (accountId) search.set('accountId', accountId)
      if (cursor) search.set('cursor', cursor)
      if (query) search.set('q', query)
      return request<{ messages: YandexMailMessageSummary[]; page: PageInfo }>(
        `/api/yandex-mail/messages?${search}`,
        { signal },
      )
    },
    yandexMailMessage: (accountId: string, messageId: string, signal?: AbortSignal) => request<{
      message: YandexMailMessageDetail
    }>(
      `/api/yandex-mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`,
      { signal, timeoutMs: 30_000 },
    ),
    yandexMailAttachmentUrl: (accountId: string, messageId: string, partId: string) => (
      `/api/yandex-mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`
      + `/attachments/${encodeURIComponent(partId)}`
    ),
  }
}
