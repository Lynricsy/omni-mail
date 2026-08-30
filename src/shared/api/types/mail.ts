export type MailboxScope =
  | { type: 'all' }
  | { type: 'domain'; value: string }
  | { type: 'mailbox'; value: string }

export interface MessageSummary {
  id: string
  mailboxAddress: string
  direction: 'incoming' | 'outgoing'
  status: 'processing' | 'ready' | 'failed' | 'sent'
  folder: 'inbox' | 'sent' | 'trash'
  senderName: string
  senderAddress: string
  recipients: string[]
  subject: string
  preview: string
  date: number
  attachmentCount: number
  isRead: boolean
  isStarred: boolean
  processingError: string | null
  deliveryStatus: 'queued' | 'sent' | 'delivered' | 'delayed' | 'bounced' | 'complained' | 'failed' | 'suppressed' | null
  purgeAfter: number | null
}

export interface Attachment {
  id: string
  filename: string
  contentType: string
  size: number
  contentId: string | null
  disposition: string
}

export interface DraftAttachment {
  id: string
  filename: string
  contentType: string
  size: number
}

export interface DraftSummary {
  id: string
  mailboxAddress: string
  to: string
  subject: string
  preview: string
  updatedAt: number
  attachmentCount: number
  attachmentBytes: number
}

export interface MailDraft {
  id: string
  mailboxAddress: string
  to: string
  subject: string
  text: string
  createdAt: number
  updatedAt: number
  attachments: DraftAttachment[]
}

export interface MessageDetail extends MessageSummary {
  messageId: string | null
  inReplyTo: string | null
  references: string | null
  cc: string[]
  text: string
  html: string
  attachments: Attachment[]
}

export interface AdminMessageOwner {
  id: string
  email: string
  displayName: string
}

export interface AdminMessageSummary extends MessageSummary {
  sizeBytes: number
  owner: AdminMessageOwner
}

export interface AdminMessageDetail extends MessageDetail {
  owner: AdminMessageOwner
}

export interface AdminMessageFilters {
  query: string
  user: string
  mailbox: string
  direction: 'all' | 'incoming' | 'outgoing'
  folder: 'all' | 'inbox' | 'sent' | 'trash'
  status: 'all' | 'processing' | 'ready' | 'failed' | 'sent'
  days: 0 | 1 | 7 | 30 | 90
}

export type AdminMessageAction = 'trash' | 'restore' | 'delete'

export type TranslationTargetLanguage = 'en' | 'zh'

export interface MessageTranslation {
  sourceLanguage: string
  targetLanguage: TranslationTargetLanguage
  subject: string
  text: string
  html: string
  cached: boolean
}
