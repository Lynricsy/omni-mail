import type {
  AppConfig,
  ICloudAccount,
  ICloudAlias,
  ICloudMessage,
  ManagedDomain,
  MailboxAddress,
  MailCounts,
  MessageDetail,
  MessageSummary,
  PageInfo,
  User,
} from '../../src/shared/api/api-types'
import type {
  IndexedMailSourceId,
  IndexedMessageDetail,
  IndexedMessageSummary,
  MailSourceFolder,
  MailSourceDescriptor,
} from './mail-source'
import type { NotificationSettings } from './notification-settings'

export interface AuthStatus {
  apiOrigin: string
  authenticated: boolean
  iCloudAuthorized: boolean
  mailSourcesAuthorized: boolean
  user: User | null
}

export interface MailSourcesResult {
  sources: MailSourceDescriptor[]
  unavailable: Array<MailSourceDescriptor['id']>
  upgradeRequired: boolean
}

export interface IndexedInboxResult {
  messages: IndexedMessageSummary[]
  page: PageInfo
}

export interface AttachmentPayload {
  filename: string
  contentType: string
  contentBase64: string
}

export interface ComposeAttachmentPayload {
  filename: string
  contentType: string
  contentBase64: string
}

export interface ComposeRequestInput {
  source: 'omnimail' | 'qq' | 'linuxdo'
  accountId?: string
  sender: string
  to: string
  subject: string
  text: string
  replyToMessageId?: string
  attachments: ComposeAttachmentPayload[]
}

export interface InboxResult {
  unchanged: boolean
  version: number
  messages: MessageSummary[]
  counts: MailCounts
  page: PageInfo
}

export type ExtensionRequest =
  | { type: 'auth:status' }
  | { type: 'auth:authorize'; apiOrigin: string }
  | { type: 'auth:logout' }
  | { type: 'api:config' }
  | { type: 'api:mailboxes' }
  | { type: 'api:domains' }
  | { type: 'api:messages'; mailbox?: string; cursor?: string }
  | { type: 'api:message'; id: string }
  | { type: 'api:message-attachment'; messageId: string; attachmentId: string; filename: string }
  | { type: 'api:create-mailbox'; address: string }
  | { type: 'api:mark-read'; id: string }
  | { type: 'api:icloud-accounts' }
  | { type: 'api:icloud-aliases'; accountId: string }
  | { type: 'api:create-icloud-alias'; accountId: string; label: string }
  | { type: 'api:icloud-inbox'; accountId: string; alias?: string }
  | { type: 'api:icloud-message'; accountId: string; id: string }
  | { type: 'api:mail-sources' }
  | { type: 'api:indexed-source-messages'; source: IndexedMailSourceId; accountId?: string; query?: string; cursor?: string; folder?: string }
  | { type: 'api:indexed-source-message'; source: IndexedMailSourceId; accountId: string; id: string; folder?: string }
  | { type: 'api:indexed-source-folders'; source: IndexedMailSourceId; accountId: string }
  | { type: 'api:indexed-source-sync'; source: IndexedMailSourceId; accountId: string }
  | { type: 'api:indexed-source-attachment'; source: IndexedMailSourceId; accountId: string; messageId: string; attachmentId: string; filename: string }
  | ({ type: 'api:compose-send' } & ComposeRequestInput)
  | ({ type: 'api:compose-save-draft' } & Omit<ComposeRequestInput, 'source' | 'replyToMessageId'>)
  | { type: 'page:fill-email'; email: string }
  | { type: 'settings:set-floating'; enabled: boolean }
  | { type: 'settings:set-theme'; theme: ThemePreference }
  | ({ type: 'settings:set-notifications' } & NotificationSettings)
  | { type: 'settings:get' }

export type ThemePreference = 'system' | 'light' | 'dark'

export interface ExtensionSettings extends NotificationSettings {
  floatingEnabled: boolean
  theme: ThemePreference
}

export type ExtensionResponse =
  | AuthStatus
  | AppConfig
  | ExtensionSettings
  | InboxResult
  | MailSourcesResult
  | IndexedInboxResult
  | AttachmentPayload
  | { folders: MailSourceFolder[] }
  | { queued: true }
  | { draft: { id: string } }
  | { message: { id: string; status: string } }
  | { mailboxes: MailboxAddress[] }
  | { domains: ManagedDomain[] }
  | { accounts: ICloudAccount[] }
  | { aliases: ICloudAlias[] }
  | { alias: Pick<ICloudAlias, 'email' | 'label' | 'createdAt'> }
  | { messages: ICloudMessage[]; method: 'imap' | 'web' }
  | { message: ICloudMessage }
  | { message: IndexedMessageDetail }
  | { message: MessageDetail; thread: MessageSummary[] }
  | { mailbox: MailboxAddress }
  | { ok: true }

export function sendExtensionMessage<T extends ExtensionResponse>(
  request: ExtensionRequest,
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response: T | { error?: string } | undefined) => {
      const runtimeError = chrome.runtime.lastError
      if (runtimeError) {
        reject(new Error(runtimeError.message))
        return
      }
      if (!response || ('error' in response && response.error)) {
        reject(new Error(response?.error || '扩展后台没有响应。'))
        return
      }
      resolve(response as T)
    })
  })
}
