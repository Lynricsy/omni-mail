import type { PlatformUsage } from '../../platform/usage'
import type { User, UserRole } from './core'

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
  | 'icloud'
  | 'gmail'
  | 'microsoft'
  | 'qq-mail'
  | 'linuxdo-mail'
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
