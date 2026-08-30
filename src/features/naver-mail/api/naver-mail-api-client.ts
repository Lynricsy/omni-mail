import type {
  PageInfo,
  NaverMailAccount,
  NaverMailMessageDetail,
  NaverMailMessageSummary,
} from '../../../shared/api/api-types'

type Request = <T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
) => Promise<T>

export function createNaverMailApi(request: Request, jsonBody: (value: unknown) => string) {
  return {
    naverMailAccounts: (signal?: AbortSignal) => request<{
      enabled: boolean
      accounts: NaverMailAccount[]
    }>('/api/naver-mail/accounts', { signal }),
    connectNaverMail: (input: {
      name: string
      email: string
      appPassword: string
    }) => request<{ account: NaverMailAccount }>('/api/naver-mail/accounts', {
      method: 'POST', body: jsonBody(input), timeoutMs: 30_000,
    }),
    renameNaverMail: (accountId: string, name: string) => request<{ account: NaverMailAccount }>(
      `/api/naver-mail/accounts/${encodeURIComponent(accountId)}`,
      { method: 'PATCH', body: jsonBody({ name }) },
    ),
    updateNaverMailAppPassword: (accountId: string, appPassword: string) => request<{
      account: NaverMailAccount
    }>(`/api/naver-mail/accounts/${encodeURIComponent(accountId)}/app-password`, {
      method: 'PUT', body: jsonBody({ appPassword }), timeoutMs: 30_000,
    }),
    verifyNaverMail: (accountId: string) => request<{ ok: true; validatedAt: number }>(
      `/api/naver-mail/accounts/${encodeURIComponent(accountId)}/verify`,
      { method: 'POST', timeoutMs: 30_000 },
    ),
    disconnectNaverMail: (accountId: string) => request<{
      ok: true
      remoteRevocationRequired: true
    }>(`/api/naver-mail/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' }),
    syncNaverMail: (accountId: string) => request<{ queued: true }>(
      `/api/naver-mail/accounts/${encodeURIComponent(accountId)}/sync`,
      { method: 'POST', timeoutMs: 30_000 },
    ),
    naverMailMessages: (accountId = '', cursor = '', query = '', signal?: AbortSignal) => {
      const search = new URLSearchParams({ limit: '30' })
      if (accountId) search.set('accountId', accountId)
      if (cursor) search.set('cursor', cursor)
      if (query) search.set('q', query)
      return request<{ messages: NaverMailMessageSummary[]; page: PageInfo }>(
        `/api/naver-mail/messages?${search}`,
        { signal },
      )
    },
    naverMailMessage: (accountId: string, messageId: string, signal?: AbortSignal) => request<{
      message: NaverMailMessageDetail
    }>(
      `/api/naver-mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`,
      { signal, timeoutMs: 30_000 },
    ),
    naverMailAttachmentUrl: (accountId: string, messageId: string, partId: string) => (
      `/api/naver-mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`
      + `/attachments/${encodeURIComponent(partId)}`
    ),
  }
}
