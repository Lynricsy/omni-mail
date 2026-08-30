export type YandexMailAccountStatus = 'active' | 'syncing' | 'credential_error' | 'error'

export interface YandexMailAccountRow {
  id: string
  user_id: string
  name: string
  email: string
  yandex_login: string
  app_password_cipher: string
  status: YandexMailAccountStatus
  uid_validity: number | null
  uid_next: number | null
  last_seen_uid: number
  last_synced_at: number | null
  next_sync_at: number
  last_error_code: string
  last_error_at: number | null
  sync_lease_id: string | null
  sync_lease_until: number | null
  last_manual_sync_at: number | null
  created_at: number
  updated_at: number
}

export interface YandexMailAccount extends Omit<YandexMailAccountRow,
  | 'user_id'
  | 'yandex_login'
  | 'app_password_cipher'
  | 'uid_validity'
  | 'uid_next'
  | 'last_seen_uid'
  | 'last_synced_at'
  | 'next_sync_at'
  | 'last_error_code'
  | 'last_error_at'
  | 'sync_lease_id'
  | 'sync_lease_until'
  | 'last_manual_sync_at'
  | 'created_at'
  | 'updated_at'
> {
  userId: string
  yandexLogin: string
  appPassword: string
  uidValidity: number | null
  uidNext: number | null
  lastSeenUid: number
  lastSyncedAt: number | null
  nextSyncAt: number
  lastErrorCode: string
  lastErrorAt: number | null
  syncLeaseId: string | null
  syncLeaseUntil: number | null
  lastManualSyncAt: number | null
  createdAt: number
  updatedAt: number
}

export interface PublicYandexMailAccount {
  id: string
  name: string
  email: string
  status: YandexMailAccountStatus
  lastSyncedAt: number | null
  nextSyncAt: number
  lastErrorCode: string
  lastErrorAt: number | null
  createdAt: number
  hasAppPassword: true
}

export interface YandexMailMessageMetadata {
  imapUid: number
  messageIdHeader: string
  senderName: string
  senderAddress: string
  recipients: string[]
  cc: string[]
  subject: string
  preview: string
  internalDate: number
  sizeBytes: number
  flags: string[]
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

export interface YandexMailMessageDetail {
  id: string
  from: string
  to: string
  cc: string
  subject: string
  date: string
  body: string
  html: string
  attachments: YandexMailAttachment[]
}
