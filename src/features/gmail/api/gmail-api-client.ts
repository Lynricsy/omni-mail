import type {
  GmailAccount,
  GmailMessageDetail,
  GmailMessageSummary,
  MailSyncLimit,
  PageInfo,
} from '../../../shared/api/api-types'

type Request = <T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
) => Promise<T>

export function createGmailApi(request: Request, jsonBody: (value: unknown) => string) {
  return {
    gmailAccounts: (signal?: AbortSignal) => request<{
      enabled: boolean
      accounts: GmailAccount[]
    }>('/api/gmail/accounts', { signal }),
    connectGmail: (input: { name: string; email: string; appPassword: string }) => request<{
      account: GmailAccount
    }>('/api/gmail/accounts', {
      method: 'POST', body: jsonBody(input), timeoutMs: 30_000,
    }),
    renameGmail: (accountId: string, name: string) => request<{ account: GmailAccount }>(
      `/api/gmail/accounts/${encodeURIComponent(accountId)}`,
      { method: 'PATCH', body: jsonBody({ name }) },
    ),
    updateGmailAppPassword: (accountId: string, appPassword: string) => request<{
      account: GmailAccount
    }>(`/api/gmail/accounts/${encodeURIComponent(accountId)}/app-password`, {
      method: 'PUT', body: jsonBody({ appPassword }), timeoutMs: 30_000,
    }),
    verifyGmail: (accountId: string) => request<{ ok: true; validatedAt: number }>(
      `/api/gmail/accounts/${encodeURIComponent(accountId)}/verify`,
      { method: 'POST', timeoutMs: 30_000 },
    ),
    disconnectGmail: (accountId: string) => request<{
      ok: true
      remoteRevocationRequired: true
    }>(`/api/gmail/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' }),
    syncGmail: (accountId: string, limit: MailSyncLimit = 20) => request<{
      queued: true
      limit: MailSyncLimit
    }>(
      `/api/gmail/accounts/${encodeURIComponent(accountId)}/sync`,
      { method: 'POST', body: jsonBody({ limit }), timeoutMs: 30_000 },
    ),
    gmailMessages: (accountId = '', cursor = '', query = '', signal?: AbortSignal) => {
      const search = new URLSearchParams({ limit: '30' })
      if (accountId) search.set('accountId', accountId)
      if (cursor) search.set('cursor', cursor)
      if (query) search.set('q', query)
      return request<{ messages: GmailMessageSummary[]; page: PageInfo }>(
        `/api/gmail/messages?${search}`,
        { signal },
      )
    },
    gmailMessage: (accountId: string, messageId: string, signal?: AbortSignal) => request<{
      message: GmailMessageDetail
    }>(
      `/api/gmail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`,
      { signal, timeoutMs: 30_000 },
    ),
    gmailAttachmentUrl: (accountId: string, messageId: string, partId: string) => (
      `/api/gmail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`
      + `/attachments/${encodeURIComponent(partId)}`
    ),
  }
}
