import type { LinuxDoMailAccount, LinuxDoMailMessage } from '../../../shared/api/api-types'

type Request = <T>(path: string, init?: RequestInit & { timeoutMs?: number }) => Promise<T>

function searchPath(path: string, query: string): string {
  const value = query.trim()
  return value ? `${path}?q=${encodeURIComponent(value)}` : path
}

export function createLinuxDoMailApi(request: Request, jsonBody: (value: unknown) => string) {
  return {
    linuxDoMailAccount: (signal?: AbortSignal) => request<{
      enabled: boolean
      account: LinuxDoMailAccount | null
    }>('/api/linux-do-mail/account', { signal }),
    connectLinuxDoMail: (username: string, password: string) => request<{
      account: LinuxDoMailAccount
    }>('/api/linux-do-mail/account', {
      method: 'POST',
      body: jsonBody({ username, password }),
      timeoutMs: 30_000,
    }),
    disconnectLinuxDoMail: () => request<{ ok: true }>('/api/linux-do-mail/account', {
      method: 'DELETE',
    }),
    verifyLinuxDoMail: () => request<{ ok: true; validatedAt: string }>(
      '/api/linux-do-mail/account/verify',
      { method: 'POST', timeoutMs: 30_000 },
    ),
    updateLinuxDoMailCredential: (password: string) => request<{
      account: LinuxDoMailAccount
    }>('/api/linux-do-mail/account/credential', {
      method: 'PUT',
      body: jsonBody({ password }),
      timeoutMs: 30_000,
    }),
    linuxDoMailInbox: (query = '', signal?: AbortSignal) => request<{
      messages: LinuxDoMailMessage[]
    }>(searchPath('/api/linux-do-mail/inbox', query), { signal, timeoutMs: 30_000 }),
    linuxDoMailMessage: (uid: string, signal?: AbortSignal) => request<{
      message: LinuxDoMailMessage
    }>(`/api/linux-do-mail/inbox/${encodeURIComponent(uid)}`, {
      signal,
      timeoutMs: 30_000,
    }),
    linuxDoMailSent: (query = '', signal?: AbortSignal) => request<{
      messages: LinuxDoMailMessage[]
    }>(searchPath('/api/linux-do-mail/sent', query), { signal }),
    linuxDoMailSentMessage: (id: string, signal?: AbortSignal) => request<{
      message: LinuxDoMailMessage
    }>(`/api/linux-do-mail/sent/${encodeURIComponent(id)}`, { signal }),
    sendLinuxDoMail: (input: {
      to: string
      subject: string
      text: string
      idempotencyKey: string
    }) => request<{ message: { id: string; status: string; providerId?: string } }>(
      '/api/linux-do-mail/messages',
      { method: 'POST', body: jsonBody(input) },
    ),
  }
}
