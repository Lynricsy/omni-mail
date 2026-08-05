import type { PlatformUsage } from './platformUsage'

export type Folder = 'inbox' | 'starred' | 'drafts' | 'sent' | 'trash'

export interface AppConfig {
  appName: string
  setupComplete: boolean
  replyEnabled: boolean
  registrationEnabled: boolean
  registrationAvailable: boolean
  registrationMethod: RegistrationMethod
  linuxDoLoginEnabled: boolean
  registrationDomainPolicy: RegistrationDomainPolicy
  registrationProtectionReady: boolean
  turnstileSiteKey: string
  mailRefreshInterval: MailRefreshInterval
  remoteImagesEnabled: boolean
  unassignedMailEnabled: boolean
  superAdminEmail: string
  setupRequirements: SetupRequirements
}

export interface SetupRequirements {
  databaseReady: boolean
  storageReady: boolean
  queueReady: boolean
  superAdminReady: boolean
  setupTokenReady: boolean
}

export type DeploymentCheckState = 'ready' | 'missing' | 'warning' | 'manual'

export interface DeploymentCheckItem {
  id: string
  group: 'core' | 'security' | 'mail'
  label: string
  state: DeploymentCheckState
  required: boolean
  detail: string
  action: string
}

export interface DeploymentCheck {
  generatedAt: number
  ready: boolean
  checks: DeploymentCheckItem[]
}

export interface SystemVersion {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  checkFailed: boolean
  checkedAt: number
  releaseUrl: string
  releaseRepository: string
  automaticUpdate: boolean
  automaticUpdateReason: 'not_configured' | 'super_admin_required' | null
}

export interface SystemUpdateBuild {
  id: string
  targetVersion?: string
  state: 'queued' | 'running' | 'succeeded' | 'failed'
}

export type RegistrationDomainPolicyMode = 'blocklist' | 'allowlist'
export type RegistrationMethod = 'password' | 'linuxdo'

export interface RegistrationDomainPolicy {
  mode: RegistrationDomainPolicyMode
  domains: string[]
}

export type MailRefreshInterval = 0 | 5 | 10 | 30 | 60 | 120

export type UserRole = 'super_admin' | 'admin' | 'user' | 'temporary'

export interface User {
  id: string
  email: string
  displayName: string
  role: UserRole
  mailboxLimit: number
  storageQuotaBytes: number
  storageUsedBytes: number
  canCreateMailboxes: boolean
  canReply: boolean
  canTranslate: boolean
  temporaryExpiresAt: number | null
}

export interface MfaStatus {
  ready: boolean
  enabled: boolean
  pending: boolean
  recoveryCodesRemaining: number
}

export type AccountStatus = 'active' | 'disabled'

export interface AdminUser extends User {
  status: AccountStatus
  mailboxCount: number
  outboundRateLimit: OutboundRateLimitState
  createdAt: number
  updatedAt: number
}

export interface OutboundRateLimitSettings {
  enabled: boolean
  minuteLimit: number
  dayLimit: number
}

export interface OutboundRateLimitState extends OutboundRateLimitSettings {
  minuteLimitOverride: number | null
  dayLimitOverride: number | null
  minuteUsed: number
  dayUsed: number
  minuteResetsAt: number
  dayResetsAt: number
}

export interface ManagedUserPolicy {
  role: Exclude<UserRole, 'super_admin'>
  status: AccountStatus
  mailboxLimit: number
  storageQuotaMiB: number
  canCreateMailboxes: boolean
  canReply: boolean
  canTranslate: boolean
}

export interface CreateManagedUser extends ManagedUserPolicy {
  email: string
  displayName: string
  password: string
}

export interface StoragePolicy {
  backupEnabled: boolean
  backupReady: boolean
  backupMissing: string[]
  backupRetention: {
    dailyDays: 30
    weeklyDays: 84
    monthlyDays: 365
    mailDays: 90
  }
  trashRetentionDays: number
  temporaryDataRetentionDays: number
  auditRetentionDays: number
  failedMessageRetentionDays: number
  defaultUserQuotaMiB: number
  defaultTemporaryQuotaMiB: number
  draftLimits: {
    superAdmin: number
    admin: number
    user: number
    temporary: number
  }
  lastBackup: {
    id: string
    trigger: 'scheduled' | 'manual' | 'enable'
    status: 'running' | 'succeeded' | 'failed'
    objectKey: string | null
    size: number
    error: string | null
    startedAt: number
    completedAt: number | null
  } | null
}

export interface BackupObject {
  key: string
  size: number
  uploadedAt: number
  etag: string
}

export interface BackupDrillResult {
  key: string
  status: 'passed' | 'failed'
  size: number
  checkedAt: number
  checks: Array<{
    label: string
    passed: boolean
    detail: string
  }>
}

export interface MailCounts {
  unread: number
  starred: number
  drafts: number
  sent: number
  trash: number
}

export interface PageInfo {
  hasMore: boolean
  nextCursor: string | null
  limit: number
}

export interface AdminUserTotals {
  total: number
  active: number
  disabled: number
}

export type AuditDays = 1 | 7 | 30 | 90
export type AuditCategory =
  | 'all'
  | 'auth'
  | 'account'
  | 'user'
  | 'mailbox'
  | 'domain'
  | 'invitation'
  | 'message'
  | 'system'

export interface AuditLog {
  id: number
  actor: {
    id: string
    email: string | null
    displayName: string | null
    role: UserRole | null
  } | null
  action: string
  targetId: string | null
  target: {
    id: string | null
    email: string | null
    displayName: string | null
  } | null
  ip: string
  detail: Record<string, unknown>
  createdAt: number
}

export interface AuditSummary {
  total: number
  loginSuccess: number
  loginFailed: number
}

export interface MailStatistics {
  days: 7 | 30 | 90
  generatedAt: number
  summary: {
    totalReceived: number
    periodReceived: number
    todayReceived: number
    uniqueSenders: number
  }
  daily: Array<{ day: number; count: number }>
  sourceDomains: Array<{ domain: string; count: number }>
  topSenders: Array<{ address: string; name: string | null; count: number }>
  platform: PlatformUsage
  storage: {
    messageCount: number
    usedBytes: number
    attachmentCount: number
    attachmentBytes: number
    trashCount: number
    trashBytes: number
    failedCount: number
    failedBytes: number
    userCount: number
    quotaBytes: number; quotaUsedBytes: number
    unlimitedUsers: number
    byUser: Array<{
      id: string; email: string; displayName: string
      role: UserRole
      mailboxCount: number; messageCount: number
      usedBytes: number; quotaBytes: number
    }>
    byMailbox: Array<{
      address: string; userEmail: string
      messageCount: number; usedBytes: number
    }>
  }
}

export type MailCleanupFilter = {
  scope: 'all' | 'user' | 'mailbox'
  scopeValue: string
  category: 'trash' | 'failed' | 'incoming' | 'sent' | 'all'
  olderThanDays: number
}

export type MailCleanupPreview = {
  messageCount: number; bytes: number; attachmentCount: number; cutoff: number
}

export interface MailboxAddress {
  address: string
  domain: string
  isPrimary: boolean
  isActive: boolean
}

export interface ManagedDomain {
  name: string
  isActive: boolean
  mailboxCount: number
  createdAt: number
  updatedAt: number
}

export type InviteState = 'active' | 'expired' | 'used' | 'revoked' | 'domain_disabled'

export interface TemporaryInvite {
  id: string
  domain: string
  accountRole: 'user' | 'temporary'
  expiresAt: number
  multiUse: boolean
  useCount: number
  addressMode: 'assigned' | 'self_selected'
  assignedAddress: string | null
  accountLifetimeHours: number | null
  mailboxLimit: number
  canCreateMailboxes: boolean
  canReply: boolean
  canTranslate: boolean
  createdAt: number
  state: InviteState
}

export interface CreateTemporaryInvite {
  domain: string
  accountRole: 'user' | 'temporary'
  expiresInHours: number
  accountLifetimeHours: number
  multiUse: boolean
  addressMode: 'assigned' | 'self_selected'
  assignedLocalPart: string
  mailboxLimit: number
  canCreateMailboxes: boolean
  canReply: boolean
  canTranslate: boolean
}

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
