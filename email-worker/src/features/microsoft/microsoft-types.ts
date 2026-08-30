export type MicrosoftAuthMode = 'oauth2' | 'password'
export type MicrosoftAccountStatus =
  | 'pending_validation'
  | 'active'
  | 'syncing'
  | 'credential_error'
  | 'permission_error'
  | 'error'

export interface MicrosoftAccountRow {
  id: string
  user_id: string
  name: string
  provided_email: string
  normalized_email: string
  auth_mode: MicrosoftAuthMode
  client_id: string
  authority: string
  refresh_token_cipher: string
  access_token_cipher: string
  access_token_expires_at: number | null
  password_cipher: string
  combination_password_cipher: string
  status: MicrosoftAccountStatus
  last_synced_at: number | null
  next_sync_at: number
  last_error_code: string
  last_error_at: number | null
  sync_lease_id: string | null
  sync_lease_until: number | null
  token_lease_id: string | null
  token_lease_until: number | null
  last_manual_sync_at: number | null
  created_at: number
  updated_at: number
}

export interface MicrosoftAccountSecrets {
  refreshToken: string
  accessToken: string
  password: string
}

export interface MicrosoftAccount extends MicrosoftAccountSecrets {
  id: string
  userId: string
  name: string
  providedEmail: string
  normalizedEmail: string
  authMode: MicrosoftAuthMode
  clientId: string
  authority: string
  accessTokenExpiresAt: number | null
  status: MicrosoftAccountStatus
  lastSyncedAt: number | null
  nextSyncAt: number
  lastErrorCode: string
  lastErrorAt: number | null
  syncLeaseId: string | null
  syncLeaseUntil: number | null
  tokenLeaseId: string | null
  tokenLeaseUntil: number | null
  lastManualSyncAt: number | null
  createdAt: number
  updatedAt: number
}

export interface PublicMicrosoftAccount {
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

export interface MicrosoftFolderRow {
  account_id: string
  path: string
  display_name: string
  flags_json: string
  special_use: string
  uid_validity: number | null
  last_uid: number
  last_listed_at: number
}

export interface MicrosoftFolder {
  path: string
  displayName: string
  flags: string[]
  specialUse: string
  uidValidity: number | null
  lastUid: number
}

export interface MicrosoftMessageMetadata {
  uid: number
  internetMessageId: string
  senderName: string
  senderAddress: string
  recipients: string[]
  cc: string[]
  subject: string
  preview: string
  receivedAt: number
  sentAt: number | null
  sizeBytes: number
  flags: string[]
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

export interface MicrosoftMessageDetail {
  id: string
  from: string
  to: string
  cc: string
  subject: string
  date: string
  body: string
  html: string
  attachments: MicrosoftAttachment[]
}

export interface MicrosoftImportInput {
  name?: unknown
  email?: unknown
  authMode?: unknown
  password?: unknown
  refreshToken?: unknown
  clientId?: unknown
  authority?: unknown
  persistPasswordConfirmed?: unknown
}

export interface ValidMicrosoftImport {
  name: string
  email: string
  authMode: MicrosoftAuthMode
  password: string | null
  refreshToken: string | null
  clientId: string
  authority: string
}
