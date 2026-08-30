import type {
  MailSyncLimit,
  PageInfo,
  QqMailAccount,
  QqMailMessageDetail,
  QqMailMessageSummary,
} from '../../../shared/api/api-types'

type Request = <T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
) => Promise<T>

export function createQqMailApi(request: Request, jsonBody: (value: unknown) => string) {
  return {
    qqMailAccounts: (signal?: AbortSignal) => request<{
      enabled: boolean
      accounts: QqMailAccount[]
    }>('/api/qq-mail/accounts', { signal }),
    connectQqMail: (input: {
      name: string
      email: string
      authorizationCode: string
    }) => request<{ account: QqMailAccount }>('/api/qq-mail/accounts', {
      method: 'POST', body: jsonBody(input), timeoutMs: 30_000,
    }),
    renameQqMail: (accountId: string, name: string) => request<{ account: QqMailAccount }>(
      `/api/qq-mail/accounts/${encodeURIComponent(accountId)}`,
      { method: 'PATCH', body: jsonBody({ name }) },
    ),
    updateQqMailAuthorizationCode: (accountId: string, authorizationCode: string) => request<{
      account: QqMailAccount
    }>(`/api/qq-mail/accounts/${encodeURIComponent(accountId)}/authorization-code`, {
      method: 'PUT', body: jsonBody({ authorizationCode }), timeoutMs: 30_000,
    }),
    verifyQqMail: (accountId: string) => request<{ ok: true; validatedAt: number }>(
      `/api/qq-mail/accounts/${encodeURIComponent(accountId)}/verify`,
      { method: 'POST', timeoutMs: 30_000 },
    ),
    disconnectQqMail: (accountId: string) => request<{
      ok: true
      remoteRevocationRequired: true
    }>(`/api/qq-mail/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' }),
    syncQqMail: (accountId: string, limit: MailSyncLimit = 20) => request<{
      queued: true
      limit: MailSyncLimit
    }>(
      `/api/qq-mail/accounts/${encodeURIComponent(accountId)}/sync`,
      { method: 'POST', body: jsonBody({ limit }), timeoutMs: 30_000 },
    ),
    addQqMailIdentity: (accountId: string, input: { name: string; email: string }) => request<{
      account: QqMailAccount
    }>(`/api/qq-mail/accounts/${encodeURIComponent(accountId)}/identities`, {
      method: 'POST', body: jsonBody(input), timeoutMs: 30_000,
    }),
    deleteQqMailIdentity: (accountId: string, identityId: string) => request<{
      account: QqMailAccount
    }>(`/api/qq-mail/accounts/${encodeURIComponent(accountId)}/identities/${
      encodeURIComponent(identityId)}`, { method: 'DELETE' }),
    sendQqMail: (accountId: string, input: {
      sender: string
      to: string
      subject: string
      text: string
      idempotencyKey: string
      replyToMessageId?: string
    }) => request<{ message: { id: string; status: string; providerId?: string } }>(
      `/api/qq-mail/accounts/${encodeURIComponent(accountId)}/messages`,
      { method: 'POST', body: jsonBody(input) },
    ),
    qqMailMessages: (accountId = '', cursor = '', query = '', signal?: AbortSignal) => {
      const search = new URLSearchParams({ limit: '30' })
      if (accountId) search.set('accountId', accountId)
      if (cursor) search.set('cursor', cursor)
      if (query) search.set('q', query)
      return request<{ messages: QqMailMessageSummary[]; page: PageInfo }>(
        `/api/qq-mail/messages?${search}`,
        { signal },
      )
    },
    qqMailMessage: (accountId: string, messageId: string, signal?: AbortSignal) => request<{
      message: QqMailMessageDetail
    }>(
      `/api/qq-mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`,
      { signal, timeoutMs: 30_000 },
    ),
    qqMailAttachmentUrl: (accountId: string, messageId: string, partId: string) => (
      `/api/qq-mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`
      + `/attachments/${encodeURIComponent(partId)}`
    ),
  }
}
