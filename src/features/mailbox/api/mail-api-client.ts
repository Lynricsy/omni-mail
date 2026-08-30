import type {
  DraftAttachment,
  DraftSummary,
  Folder,
  MailboxAddress,
  MailboxScope,
  MailCounts,
  MailDraft,
  MessageDetail,
  MessageTranslation,
  MessageSummary,
  PageInfo,
  TranslationTargetLanguage,
} from '../../../shared/api/api-types'

type Request = <T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
) => Promise<T>

export function createMailApi(
  request: Request,
  jsonBody: (value: unknown) => string,
  apiOrigin: string,
) {
  return {
    mailboxes: () => request<{ mailboxes: MailboxAddress[] }>('/api/mailboxes'),
    addMailbox: (address: string) => request<{ mailbox: MailboxAddress }>('/api/mailboxes', {
      method: 'POST',
      body: jsonBody({ address }),
    }),
    updateMailbox: (address: string, isActive: boolean) => (
      request<{ mailbox: MailboxAddress }>(`/api/mailboxes/${encodeURIComponent(address)}`, {
        method: 'PATCH',
        body: jsonBody({ isActive }),
      })
    ),
    setPrimaryMailbox: (address: string) => (
      request<{ mailbox: MailboxAddress }>(`/api/mailboxes/${encodeURIComponent(address)}`, {
        method: 'PATCH',
        body: jsonBody({ isPrimary: true }),
      })
    ),
    deleteMailbox: (address: string) => request<{ ok: true }>(
      `/api/mailboxes/${encodeURIComponent(address)}`,
      { method: 'DELETE' },
    ),
    messages: (
      folder: Folder,
      query: string,
      scope: MailboxScope,
      cursor?: string,
      version?: number,
      signal?: AbortSignal,
    ) => {
      const search = new URLSearchParams({ folder, limit: '30' })
      if (query) search.set('q', query)
      if (scope.type === 'domain') search.set('domain', scope.value)
      if (scope.type === 'mailbox') search.set('mailbox', scope.value)
      if (cursor) search.set('cursor', cursor)
      if (version !== undefined) search.set('version', String(version))
      return request<{ unchanged: true; version: number } | {
        unchanged: false
        version: number
        messages: MessageSummary[]
        counts: MailCounts
        page: PageInfo
      }>(`/api/messages?${search}`, { signal })
    },
    drafts: () => request<{ drafts: DraftSummary[]; limit: number }>('/api/drafts'),
    draft: (id: string) => request<{ draft: MailDraft }>(
      `/api/drafts/${encodeURIComponent(id)}`,
    ),
    createDraft: (input: Pick<MailDraft, 'mailboxAddress' | 'to' | 'subject' | 'text'>) => (
      request<{ draft: MailDraft }>('/api/drafts', {
        method: 'POST',
        body: jsonBody(input),
      })
    ),
    saveDraft: (
      id: string,
      input: Pick<MailDraft, 'mailboxAddress' | 'to' | 'subject' | 'text'>,
    ) => request<{ draft: MailDraft }>(`/api/drafts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: jsonBody(input),
    }),
    discardDraft: (id: string) => request<{ ok: true }>(
      `/api/drafts/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),
    uploadDraftAttachment: (id: string, file: File) => {
      const body = new FormData()
      body.set('file', file)
      return request<{ attachment: DraftAttachment }>(
        `/api/drafts/${encodeURIComponent(id)}/attachments`, {
          method: 'POST',
          body,
          timeoutMs: 60_000,
        },
      )
    },
    deleteDraftAttachment: (draftId: string, attachmentId: string) => request<{ ok: true }>(
      `/api/drafts/${encodeURIComponent(draftId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { method: 'DELETE' },
    ),
    sendDraft: (id: string, idempotencyKey: string) => request<{
      message: { id: string; status: string; providerId?: string }
    }>(`/api/drafts/${encodeURIComponent(id)}/send`, {
      method: 'POST',
      body: jsonBody({ idempotencyKey }),
    }),
    message: (id: string, signal?: AbortSignal) => request<{
      message: MessageDetail
      thread: MessageSummary[]
    }>(`/api/messages/${id}`, { signal }),
    translateMessage: (id: string, targetLanguage: TranslationTargetLanguage) => request<{
      translation: MessageTranslation
    }>(`/api/messages/${id}/translation`, {
      method: 'POST',
      body: jsonBody({ targetLanguage }),
      timeoutMs: 60_000,
    }),
    updateMessage: (
      id: string,
      input: { isRead?: boolean; isStarred?: boolean; folder?: 'inbox' | 'sent' | 'trash' },
    ) => request<{ ok: true }>(`/api/messages/${id}`, {
      method: 'PATCH',
      body: jsonBody(input),
    }),
    deleteMessage: (id: string) => request<{ ok: true }>(`/api/messages/${id}`, {
      method: 'DELETE',
    }),
    reply: (id: string, text: string, idempotencyKey: string, attachments: File[] = []) => {
      let body: BodyInit
      if (attachments.length) {
        const form = new FormData()
        form.set('text', text)
        form.set('idempotencyKey', idempotencyKey)
        for (const attachment of attachments) form.append('attachments', attachment)
        body = form
      } else {
        body = jsonBody({ text, idempotencyKey })
      }
      return request<{ message: { id: string; status: string; providerId?: string } }>(
        `/api/messages/${id}/reply`,
        { method: 'POST', body, timeoutMs: attachments.length ? 60_000 : undefined },
      )
    },
    sendMessage: (input: {
      mailboxAddress: string
      to: string
      subject: string
      text: string
      idempotencyKey: string
    }) => request<{ message: { id: string; status: string; providerId?: string } }>(
      '/api/messages',
      { method: 'POST', body: jsonBody(input) },
    ),
    attachmentUrl: (messageId: string, attachmentId: string) => (
      `${apiOrigin}/api/messages/${messageId}/attachments/${attachmentId}`
    ),
    attachmentPreviewUrl: (messageId: string, attachmentId: string) => (
      `${apiOrigin}/api/messages/${messageId}/attachments/${attachmentId}?preview=1`
    ),
    remoteImageUrl: (source: string) => (
      `${apiOrigin}/api/remote-images?url=${encodeURIComponent(source)}`
    ),
    rawUrl: (messageId: string) => `${apiOrigin}/api/messages/${messageId}/raw`,
  }
}
