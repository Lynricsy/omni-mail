import { request } from '../../../shared/api'

export interface FailedMail {
  id: string
  mailboxAddress: string
  senderName: string
  senderAddress: string
  subject: string
  error: string
  attempts: number
  lastFailedAt: number
  size: number
  canRetry: boolean
}

export const failedMailApi = {
  list: () => request<{ messages: FailedMail[]; total: number }>(
    '/api/admin/failed-messages',
  ),
  retry: (id: string) => request<{ ok: true }>(
    `/api/admin/failed-messages/${encodeURIComponent(id)}/retry`,
    { method: 'POST' },
  ),
}
