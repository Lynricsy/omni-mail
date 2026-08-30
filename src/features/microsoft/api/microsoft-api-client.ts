import type {
  MicrosoftAccount,
  MicrosoftFolder,
  MicrosoftImportAccount,
  MicrosoftImportResult,
  MicrosoftMessageDetail,
  MicrosoftMessageSummary,
  PageInfo,
} from '../../../shared/api/api-types'

type Request = <T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
) => Promise<T>

export function createMicrosoftApi(request: Request, jsonBody: (value: unknown) => string) {
  return {
    microsoftAccounts: (signal?: AbortSignal) => request<{
      enabled: boolean
      accounts: MicrosoftAccount[]
    }>('/api/microsoft/accounts', { signal }),
    importMicrosoftAccounts: (accounts: MicrosoftImportAccount[]) => request<{
      results: MicrosoftImportResult[]
    }>('/api/microsoft/accounts/import', {
      method: 'POST', body: jsonBody({ accounts }), timeoutMs: 120_000,
    }),
    renameMicrosoft: (accountId: string, name: string) => request<{
      account: MicrosoftAccount
    }>(`/api/microsoft/accounts/${encodeURIComponent(accountId)}`, {
      method: 'PATCH', body: jsonBody({ name }),
    }),
    updateMicrosoftCredential: (
      accountId: string,
      credential: Omit<MicrosoftImportAccount, 'email' | 'name'>,
    ) => request<{ ok: true }>(
      `/api/microsoft/accounts/${encodeURIComponent(accountId)}/credential`,
      { method: 'PUT', body: jsonBody(credential), timeoutMs: 60_000 },
    ),
    verifyMicrosoft: (accountId: string) => request<{ ok: true; validatedAt: number }>(
      `/api/microsoft/accounts/${encodeURIComponent(accountId)}/verify`,
      { method: 'POST', timeoutMs: 60_000 },
    ),
    disconnectMicrosoft: (accountId: string) => request<{
      ok: true
      remoteRevocationRequired: boolean
    }>(`/api/microsoft/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' }),
    syncMicrosoft: (accountId: string) => request<{ queued: true }>(
      `/api/microsoft/accounts/${encodeURIComponent(accountId)}/sync`,
      { method: 'POST', timeoutMs: 30_000 },
    ),
    microsoftFolders: (accountId: string, refresh = false, signal?: AbortSignal) => {
      const search = refresh ? '?refresh=1' : ''
      return request<{ folders: MicrosoftFolder[] }>(
        `/api/microsoft/accounts/${encodeURIComponent(accountId)}/folders${search}`,
        { signal, timeoutMs: refresh ? 60_000 : undefined },
      )
    },
    microsoftMessages: (input: {
      accountId?: string
      folder?: string
      limit?: number
      cursor?: string
      query?: string
      refresh?: boolean
      signal?: AbortSignal
    }) => {
      const search = new URLSearchParams({ limit: String(input.limit ?? 50) })
      if (input.accountId) search.set('accountId', input.accountId)
      if (input.folder) search.set('folder', input.folder)
      if (input.cursor) search.set('cursor', input.cursor)
      if (input.query) search.set('q', input.query)
      if (input.refresh) search.set('refresh', '1')
      return request<{
        messages: MicrosoftMessageSummary[]
        page: PageInfo
        folderPath: string
      }>(`/api/microsoft/messages?${search}`, {
        signal: input.signal,
        timeoutMs: input.refresh ? 120_000 : undefined,
      })
    },
    microsoftMessage: (accountId: string, messageId: string, signal?: AbortSignal) => request<{
      message: MicrosoftMessageDetail
    }>(
      `/api/microsoft/accounts/${encodeURIComponent(accountId)}`
        + `/messages/${encodeURIComponent(messageId)}`,
      { signal, timeoutMs: 60_000 },
    ),
    microsoftAttachmentUrl: (accountId: string, messageId: string, partId: string) => (
      `/api/microsoft/accounts/${encodeURIComponent(accountId)}`
      + `/messages/${encodeURIComponent(messageId)}`
      + `/attachments/${encodeURIComponent(partId)}`
    ),
  }
}
