import type { AppConfig } from '../../src/shared/api/api-types'
import { createComposeDraft, sendComposeMessage } from './compose-background'
import {
  discoverMailSources,
  getIndexedSourceMessage,
  indexedSourceAttachmentPath,
  listIndexedSourceFolders,
  listIndexedSourceMessages,
  syncIndexedSource,
} from './mail-source-background'
import type { ExtensionRequest } from './protocol'

type AuthenticatedRequest = <T = unknown>(path: string, init?: RequestInit) => Promise<T>

export async function extensionApiCall(
  message: ExtensionRequest,
  request: AuthenticatedRequest,
  attachment: (path: string, filename: string) => Promise<unknown>,
  scopes: () => Promise<string[] | undefined>,
): Promise<unknown> {
  switch (message.type) {
    case 'api:config': return request('/api/config')
    case 'api:mailboxes': return request('/api/mailboxes')
    case 'api:domains': return request('/api/domains')
    case 'api:messages': {
      const search = new URLSearchParams({ folder: 'inbox', limit: '30' })
      if (message.mailbox) search.set('mailbox', message.mailbox)
      if (message.cursor) search.set('cursor', message.cursor)
      return request(`/api/messages?${search}`)
    }
    case 'api:message':
      return request(`/api/messages/${encodeURIComponent(message.id)}`)
    case 'api:message-attachment':
      return attachment(
        `/api/messages/${encodeURIComponent(message.messageId)}`
        + `/attachments/${encodeURIComponent(message.attachmentId)}`,
        message.filename,
      )
    case 'api:create-mailbox':
      return request('/api/mailboxes', {
        method: 'POST', body: JSON.stringify({ address: message.address }),
      })
    case 'api:mark-read':
      return request(`/api/messages/${encodeURIComponent(message.id)}`, {
        method: 'PATCH', body: JSON.stringify({ isRead: true }),
      })
    case 'api:icloud-accounts': return request('/api/icloud/accounts')
    case 'api:icloud-aliases':
      return request(`/api/icloud/aliases?accountId=${encodeURIComponent(message.accountId)}`)
    case 'api:create-icloud-alias':
      return request('/api/icloud/aliases', {
        method: 'POST',
        body: JSON.stringify({ accountId: message.accountId, label: message.label }),
      })
    case 'api:icloud-inbox': {
      const search = new URLSearchParams({
        accountId: message.accountId, limit: '30', days: '7',
      })
      if (message.alias) search.set('alias', message.alias)
      return request(`/api/icloud/inbox?${search}`)
    }
    case 'api:icloud-message':
      return request(
        `/api/icloud/inbox/${encodeURIComponent(message.id)}`
        + `?accountId=${encodeURIComponent(message.accountId)}`,
      )
    case 'api:mail-sources': {
      const [config, grantedScopes] = await Promise.all([
        request<AppConfig>('/api/config'), scopes(),
      ])
      return discoverMailSources(request, config, grantedScopes)
    }
    case 'api:indexed-source-messages': return listIndexedSourceMessages(request, message)
    case 'api:indexed-source-message': return getIndexedSourceMessage(request, message)
    case 'api:indexed-source-folders': return listIndexedSourceFolders(request, message)
    case 'api:indexed-source-sync': return syncIndexedSource(request, message)
    case 'api:indexed-source-attachment':
      return attachment(indexedSourceAttachmentPath({
        source: message.source,
        accountId: message.accountId,
        messageId: message.messageId,
        attachmentId: message.attachmentId,
      }), message.filename)
    case 'api:compose-save-draft': return createComposeDraft(request, message)
    case 'api:compose-send': return sendComposeMessage(request, message)
    default: throw new Error('不支持的 API 操作。')
  }
}
