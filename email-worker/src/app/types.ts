export interface ParseJob {
  kind?: 'parse'
  messageId: string
}

export interface OutboundJob {
  kind: 'outbound'
  messageId: string
  userId: string
  ip: string
  auditAction: 'message.reply' | 'message.send' | 'linuxdo_mail.message.send'
    | 'qq_mail.message.send'
  auditDetail: Record<string, unknown>
}

export interface SearchIndexJob {
  kind: 'index'
  messageId: string
}

export type MailSyncLimit = 10 | 20 | 50

export interface GmailSyncJob {
  kind: 'gmail-sync'
  accountId: string
  reason: 'connect' | 'manual' | 'scheduled'
  limit?: MailSyncLimit
}

export interface MicrosoftSyncJob {
  kind: 'microsoft-sync'
  accountId: string
  reason: 'connect' | 'manual' | 'scheduled'
}

export interface QqMailSyncJob {
  kind: 'qq-mail-sync'
  accountId: string
  reason: 'connect' | 'manual' | 'scheduled'
  limit?: MailSyncLimit
}

export interface NaverMailSyncJob {
  kind: 'naver-mail-sync'
  accountId: string
  reason: 'connect' | 'manual' | 'scheduled'
}

export interface YandexMailSyncJob {
  kind: 'yandex-mail-sync'
  accountId: string
  reason: 'connect' | 'manual' | 'scheduled'
}

export interface ExternalMailSyncJob {
  kind: 'icloud-sync' | 'linuxdo-mail-sync'
  accountId: string
  reason: 'scheduled'
  limit?: MailSyncLimit
}

export type MailQueueJob =
  | ParseJob
  | OutboundJob
  | SearchIndexJob
  | GmailSyncJob
  | MicrosoftSyncJob
  | QqMailSyncJob
  | NaverMailSyncJob
  | YandexMailSyncJob
  | ExternalMailSyncJob

export interface BackupWorkflowParams {
  trigger?: 'scheduled' | 'manual' | 'enable'
  requestedBy?: string
  includeMail?: boolean
}

export interface CleanupWorkflowParams {
  startedAt: number
  mailboxDeletion?: {
    address: string
    userId: string
    requestedBy: string
  }
}

export interface Env {
  DB: D1Database
  MAIL_BUCKET: R2Bucket
  MAIL_QUEUE: Queue<MailQueueJob>
  AI?: Ai
  ASSETS: Fetcher
  BACKUP_BUCKET?: R2Bucket
  BACKUP_WORKFLOW?: Workflow<BackupWorkflowParams>
  CLEANUP_WORKFLOW?: Workflow<CleanupWorkflowParams>
  APP_NAME?: string
  APP_ORIGINS?: string
  SUPER_ADMIN_EMAIL?: string
  COOKIE_SECURE?: string
  SETUP_TOKEN?: string
  RESEND_DOMAIN_CONFIGS?: string
  RESEND_WEBHOOK_SECRET?: string
  RESEND_WEBHOOK_SECRETS?: string
  SENDFLARE_API_KEY?: string
  SENDFLARE_FROM?: string
  SENDFLARE_DOMAIN_CONFIGS?: string
  TOTP_ENCRYPTION_KEY?: string
  ICLOUD_CREDENTIALS_KEY?: string
  LINUX_DO_MAIL_CREDENTIALS_KEY?: string
  GMAIL_CREDENTIALS_KEY?: string
  GMAIL_IMAP_ENABLED?: string
  MICROSOFT_CREDENTIALS_KEY?: string
  MICROSOFT_MAIL_ENABLED?: string
  QQ_MAIL_CREDENTIALS_KEY?: string
  QQ_MAIL_IMAP_ENABLED?: string
  NAVER_MAIL_CREDENTIALS_KEY?: string
  NAVER_MAIL_IMAP_ENABLED?: string
  YANDEX_MAIL_CREDENTIALS_KEY?: string
  YANDEX_MAIL_IMAP_ENABLED?: string
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  LINUX_DO_CLIENT_ID?: string
  LINUX_DO_CLIENT_SECRET?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  UPDATE_REPOSITORY?: string
  D1_DATABASE_ID?: string
  D1_REST_API_TOKEN?: string
}

export type UserRole = 'super_admin' | 'admin' | 'user' | 'temporary'

export interface UserRow {
  id: string
  email: string
  display_name: string
  password_hash: string
  role: UserRole
  status: 'active' | 'disabled'
  mailbox_limit: number
  storage_quota_bytes: number
  storage_used_bytes: number
  can_create_mailboxes: number
  can_reply: number
  can_translate: number
  outbound_minute_limit: number | null
  outbound_day_limit: number | null
  temporary_expires_at: number | null
  deleted_at: number | null
  created_at: number
}

export interface SessionUser {
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

export interface MessageRow {
  id: string
  mailbox_address: string
  direction: 'incoming' | 'outgoing'
  status: 'processing' | 'ready' | 'failed' | 'sent'
  folder: 'inbox' | 'sent' | 'trash'
  message_id: string | null
  in_reply_to: string | null
  references_header: string | null
  sender_name: string | null
  sender_address: string
  delivered_to: string | null
  recipients_json: string
  cc_json: string
  reply_to_json: string
  subject: string
  preview: string
  received_at: number | null
  sent_at: number | null
  raw_key: string | null
  body_key: string | null
  size: number
  quota_bytes: number
  stored_bytes: number
  attachment_count: number
  has_html: number
  is_read: number
  is_starred: number
  trashed_at: number | null
  purge_after: number | null
  processing_error: string | null
  processing_attempts: number
  last_failed_at: number | null
  client_request_id: string | null
  provider_id: string | null
  delivery_status: 'queued' | 'sent' | 'delivered' | 'delayed' | 'bounced' | 'complained' | 'failed' | 'suppressed' | null
  provider_event_at: number | null
  created_at: number
  updated_at: number
}

export interface AttachmentRow {
  id: string
  message_id: string
  filename: string
  content_type: string
  size: number
  r2_key: string
  content_id: string | null
  disposition: string
}

export interface StoredBody {
  text: string
  html: string
}
