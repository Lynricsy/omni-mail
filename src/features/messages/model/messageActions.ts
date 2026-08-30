import { request } from '../../../shared/api'

export type BulkMessageAction =
  | 'read'
  | 'unread'
  | 'star'
  | 'unstar'
  | 'trash'
  | 'restore'
  | 'delete'

export function bulkMessages(ids: string[], action: BulkMessageAction) {
  return request<{ ok: true; updatedCount: number }>('/api/messages/bulk', {
    method: 'PATCH',
    body: JSON.stringify({ ids, action }),
  })
}
