export type ICloudHost = 'icloud.com' | 'icloud.com.cn'

export interface ICloudAccount {
  id: string
  name: string
  realEmail: string
  icloudEmail: string
  host: ICloudHost
  status: 'active' | 'pending' | 'error'
  aliasTotal: number
  aliasActive: number
  lastValidated: string
  lastError: string
  createdAt: string
  hasCookies: boolean
  hasAppPassword: boolean
}

export interface ICloudAlias {
  email: string
  anonymousId: string
  label: string
  active: boolean
  createdAt?: string
}

export interface ICloudMessage {
  id: string
  from: string
  to: string
  subject: string
  date: string
  preview: string
  body: string
  html: string
  isRead?: boolean
}

export interface LinuxDoMailAccount {
  id: string
  username: string
  status: 'active' | 'error'
  lastValidated: string
  lastError: string
  createdAt: string
  hasPassword: boolean
}

export interface LinuxDoMailMessage extends ICloudMessage {
  direction?: 'incoming' | 'outgoing'
  status?: 'processing' | 'ready' | 'failed' | 'sent'
  deliveryStatus?: string | null
  processingError?: string
}

export interface GmailAccount {
  id: string
  name: string
  email: string
  status: 'active' | 'syncing' | 'credential_error' | 'error'
  lastSyncedAt: number | null
  nextSyncAt: number
  lastErrorCode: string
  lastErrorAt: number | null
  createdAt: number
  hasAppPassword: true
}

export interface GmailMessageSummary {
  id: string
  account: Pick<GmailAccount, 'id' | 'name' | 'email' | 'status'>
  senderName: string
  senderAddress: string
  recipients: string[]
  cc: string[]
  subject: string
  preview: string
  date: number
  sizeBytes: number
  isRead: boolean
  isStarred: boolean
  hasAttachments: boolean
}

export interface GmailAttachment {
  partId: string
  filename: string
  contentType: string
  size: number
  contentId: string | null
  disposition: string
}

export interface GmailMessageDetail extends Omit<GmailMessageSummary, 'cc' | 'date'> {
  from: string
  to: string
  cc: string
  date: string
  body: string
  html: string
  attachments: GmailAttachment[]
}

export interface QqMailAccount {
  id: string
  name: string
  email: string
  status: 'active' | 'syncing' | 'credential_error' | 'error'
  lastSyncedAt: number | null
  nextSyncAt: number
  lastErrorCode: string
  lastErrorAt: number | null
  createdAt: number
  hasAuthorizationCode: true
  identities: QqMailIdentity[]
}

export interface QqMailIdentity {
  id: string
  accountId: string
  name: string
  email: string
  isPrimary: boolean
  createdAt: number
  updatedAt: number
}

export interface QqMailMessageSummary {
  id: string
  account: Pick<QqMailAccount, 'id' | 'name' | 'email' | 'status'>
  senderName: string
  senderAddress: string
  recipients: string[]
  cc: string[]
  subject: string
  preview: string
  date: number
  sizeBytes: number
  isRead: boolean
  isStarred: boolean
  hasAttachments: boolean
}

export interface QqMailAttachment {
  partId: string
  filename: string
  contentType: string
  size: number
  contentId: string | null
  disposition: string
}

export interface QqMailMessageDetail extends Omit<QqMailMessageSummary, 'cc' | 'date'> {
  from: string
  to: string
  cc: string
  date: string
  body: string
  html: string
  attachments: QqMailAttachment[]
}

export interface NaverMailAccount {
  id: string
  name: string
  email: string
  status: 'active' | 'syncing' | 'credential_error' | 'error'
  lastSyncedAt: number | null
  nextSyncAt: number
  lastErrorCode: string
  lastErrorAt: number | null
  createdAt: number
  hasAppPassword: true
}

export interface NaverMailMessageSummary {
  id: string
  account: Pick<NaverMailAccount, 'id' | 'name' | 'email' | 'status'>
  senderName: string
  senderAddress: string
  recipients: string[]
  cc: string[]
  subject: string
  preview: string
  date: number
  sizeBytes: number
  isRead: boolean
  isStarred: boolean
  hasAttachments: boolean
}

export interface NaverMailAttachment {
  partId: string
  filename: string
  contentType: string
  size: number
  contentId: string | null
  disposition: string
}

export interface NaverMailMessageDetail
  extends Omit<NaverMailMessageSummary, 'cc' | 'date'> {
  from: string
  to: string
  cc: string
  date: string
  body: string
  html: string
  attachments: NaverMailAttachment[]
}

export interface YandexMailAccount {
  id: string
  name: string
  email: string
  status: 'active' | 'syncing' | 'credential_error' | 'error'
  lastSyncedAt: number | null
  nextSyncAt: number
  lastErrorCode: string
  lastErrorAt: number | null
  createdAt: number
  hasAppPassword: true
}

export interface YandexMailMessageSummary {
  id: string
  account: Pick<YandexMailAccount, 'id' | 'name' | 'email' | 'status'>
  senderName: string
  senderAddress: string
  recipients: string[]
  cc: string[]
  subject: string
  preview: string
  date: number
  sizeBytes: number
  isRead: boolean
  isStarred: boolean
  hasAttachments: boolean
}

export interface YandexMailAttachment {
  partId: string
  filename: string
  contentType: string
  size: number
  contentId: string | null
  disposition: string
}

export interface YandexMailMessageDetail
  extends Omit<YandexMailMessageSummary, 'cc' | 'date'> {
  from: string
  to: string
  cc: string
  date: string
  body: string
  html: string
  attachments: YandexMailAttachment[]
}

export type MicrosoftAuthMode = 'oauth2' | 'password'
export type MicrosoftAccountStatus =
  | 'pending_validation'
  | 'active'
  | 'syncing'
  | 'credential_error'
  | 'permission_error'
  | 'error'

export interface MicrosoftAccount {
  id: string
  name: string
  email: string
  authMode: MicrosoftAuthMode
  clientIdMasked: string
  authority: string
  status: MicrosoftAccountStatus
  lastSyncedAt: number | null
  nextSyncAt: number
  lastErrorCode: string
  lastErrorAt: number | null
  createdAt: number
  hasCredential: true
}

export interface MicrosoftImportAccount {
  name?: string
  email: string
  authMode: MicrosoftAuthMode
  password?: string
  refreshToken?: string
  clientId?: string
  authority?: string
  persistPasswordConfirmed?: boolean
}

export interface MicrosoftImportResult {
  index: number
  status: 'accepted' | 'duplicate' | 'error'
  code?: string
  error?: string
  account?: MicrosoftAccount
}

export interface MicrosoftFolder {
  path: string
  displayName: string
  flags: string[]
  specialUse: string
  uidValidity: number | null
  lastUid: number
}

export interface MicrosoftMessageSummary {
  id: string
  account: Pick<MicrosoftAccount, 'id' | 'name' | 'email' | 'status'>
  folderPath: string
  uidValidity: number
  uid: number
  senderName: string
  senderAddress: string
  recipients: string[]
  cc: string[]
  subject: string
  preview: string
  date: number
  sentAt: number | null
  sizeBytes: number
  isRead: boolean
  isStarred: boolean
  hasAttachments: boolean
}

export interface MicrosoftAttachment {
  partId: string
  filename: string
  contentType: string
  size: number
  contentId: string | null
  disposition: string
}

export interface MicrosoftMessageDetail
  extends Omit<MicrosoftMessageSummary, 'cc' | 'date'> {
  from: string
  to: string
  cc: string
  date: string
  body: string
  html: string
  attachments: MicrosoftAttachment[]
}
