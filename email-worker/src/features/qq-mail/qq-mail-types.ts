export type QqMailAccountStatus = 'active' | 'syncing' | 'credential_error' | 'error'

export interface QqMailAccountRow {
  id: string
  user_id: string
  name: string
  email: string
  authorization_code_cipher: string
  status: QqMailAccountStatus
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

export interface QqMailAccount extends Omit<QqMailAccountRow,
  | 'user_id'
  | 'authorization_code_cipher'
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
  authorizationCode: string
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
  identities: PublicQqMailIdentity[]
}

export interface PublicQqMailAccount {
  id: string
  name: string
  email: string
  status: QqMailAccountStatus
  lastSyncedAt: number | null
  nextSyncAt: number
  lastErrorCode: string
  lastErrorAt: number | null
  createdAt: number
  hasAuthorizationCode: true
  identities: PublicQqMailIdentity[]
}

export interface QqMailIdentityRow {
  id: string
  account_id: string
  name: string
  email: string
  is_primary: number
  created_at: number
  updated_at: number
}

export interface PublicQqMailIdentity {
  id: string
  accountId: string
  name: string
  email: string
  isPrimary: boolean
  createdAt: number
  updatedAt: number
}

export interface QqMailMessageMetadata {
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

export interface QqMailAttachment {
  partId: string
  filename: string
  contentType: string
  size: number
  contentId: string | null
  disposition: string
}

export interface QqMailMessageDetail {
  id: string
  from: string
  to: string
  cc: string
  subject: string
  date: string
  body: string
  html: string
  attachments: QqMailAttachment[]
}
