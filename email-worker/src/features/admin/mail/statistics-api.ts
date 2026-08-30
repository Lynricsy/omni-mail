import type { Env, SessionUser } from '../../../app/types'

interface SummaryRow {
  total_received: number
  period_received: number
  today_received: number
  unique_senders: number
}

interface DailyRow {
  day: number
  count: number
}

interface SourceDomainRow {
  domain: string
  count: number
}

interface SenderRow {
  address: string
  name: string | null
  count: number
}

interface StorageMessageRow {
  message_count: number
  used_bytes: number
  primary_bytes: number
  trash_count: number
  trash_bytes: number
  failed_count: number
  failed_bytes: number
  failed_attempts_today: number
}

interface StorageAttachmentRow {
  attachment_count: number
  attachment_bytes: number
  draft_attachment_bytes: number
}

interface StorageQuotaRow {
  user_count: number
  quota_bytes: number
  quota_used_bytes: number
  unlimited_users: number
}

interface StorageUserRow {
  id: string
  email: string
  display_name: string
  role: SessionUser['role']
  mailbox_count: number
  message_count: number
  used_bytes: number
  quota_bytes: number
}

interface StorageMailboxRow {
  address: string
  user_email: string
  message_count: number
  used_bytes: number
}

export function normalizeStatisticsDays(value: string | null): 7 | 30 | 90 {
  const days = Number(value)
  return days === 7 || days === 90 ? days : 30
}

const FREE_WORKER_REQUESTS = 100_000
const FREE_D1_ROWS_READ = 5_000_000
const FREE_QUEUE_OPERATIONS = 10_000
const FREE_R2_STORAGE = 10 * 1024 * 1024 * 1024

export function platformUsageEstimate(input: {
  refreshInterval: number
  messageCount: number
  userCount: number
  todayReceived: number
  failedAttemptsToday: number
  usedBytes: number
}) {
  const polls = input.refreshInterval > 0
    ? Math.ceil(86400 / input.refreshInterval)
    : 0
  const averageMessages = input.userCount > 0
    ? Math.ceil(input.messageCount / input.userCount)
    : 0
  return {
    refreshInterval: input.refreshInterval,
    workerRequests: {
      estimatedPerVisibleTab: polls,
      dailyLimit: FREE_WORKER_REQUESTS,
    },
    d1RowsRead: {
      estimatedPerVisibleTab: polls * (averageMessages + (polls ? 30 : 0)),
      dailyLimit: FREE_D1_ROWS_READ,
    },
    queueOperations: {
      estimatedToday: input.todayReceived * 3 + input.failedAttemptsToday,
      dailyLimit: FREE_QUEUE_OPERATIONS,
    },
    r2Storage: {
      estimatedPrimaryBytes: input.usedBytes,
      freeBytes: FREE_R2_STORAGE,
    },
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function isAdministrator(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin'
}

export async function mailStatistics(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  if (!isAdministrator(user)) return json({ error: '只有管理员可以查看全站统计。' }, 403)
  const days = normalizeStatisticsDays(new URL(request.url).searchParams.get('days'))
  const now = Math.floor(Date.now() / 1000)
  const today = Math.floor(now / 86400) * 86400
  const start = today - (days - 1) * 86400
  const sourceDomain = `CASE
    WHEN INSTR(sender_address, '@') > 0
    THEN LOWER(SUBSTR(sender_address, INSTR(sender_address, '@') + 1))
    ELSE '未知来源'
  END`

  const results = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS total_received,
              SUM(CASE WHEN received_at >= ? THEN 1 ELSE 0 END) AS period_received,
              SUM(CASE WHEN received_at >= ? THEN 1 ELSE 0 END) AS today_received,
              COUNT(DISTINCT CASE
                WHEN received_at >= ? THEN LOWER(sender_address)
              END) AS unique_senders
         FROM messages
        WHERE direction = 'incoming'`,
    ).bind(start, today, start),
    env.DB.prepare(
      `SELECT CAST(received_at / 86400 AS INTEGER) * 86400 AS day,
              COUNT(*) AS count
         FROM messages
        WHERE direction = 'incoming' AND received_at >= ?
        GROUP BY day
        ORDER BY day`,
    ).bind(start),
    env.DB.prepare(
      `SELECT ${sourceDomain} AS domain, COUNT(*) AS count
         FROM messages
        WHERE direction = 'incoming' AND received_at >= ?
        GROUP BY domain
        ORDER BY count DESC, domain
        LIMIT 8`,
    ).bind(start),
    env.DB.prepare(
      `SELECT LOWER(sender_address) AS address,
              MAX(NULLIF(sender_name, '')) AS name,
              COUNT(*) AS count
         FROM messages
        WHERE direction = 'incoming' AND received_at >= ?
        GROUP BY address
        ORDER BY count DESC, address
        LIMIT 8`,
    ).bind(start),
    env.DB.prepare(
      `SELECT COUNT(*) AS message_count,
              COALESCE(SUM(quota_bytes), 0) AS used_bytes,
              COALESCE(SUM(stored_bytes), 0) AS primary_bytes,
              SUM(CASE WHEN folder = 'trash' THEN 1 ELSE 0 END) AS trash_count,
              COALESCE(SUM(CASE WHEN folder = 'trash' THEN quota_bytes ELSE 0 END), 0)
                AS trash_bytes,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
              COALESCE(SUM(CASE WHEN status = 'failed' THEN quota_bytes ELSE 0 END), 0)
                AS failed_bytes,
              COALESCE(SUM(CASE WHEN last_failed_at >= ?
                THEN processing_attempts ELSE 0 END), 0) AS failed_attempts_today
         FROM messages`,
    ).bind(today),
    env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM attachments)
          + (SELECT COUNT(*) FROM mail_draft_attachments) AS attachment_count,
        (SELECT COALESCE(SUM(size), 0) FROM attachments)
          + (SELECT COALESCE(SUM(size), 0) FROM mail_draft_attachments) AS attachment_bytes,
        (SELECT COALESCE(SUM(size), 0) FROM mail_draft_attachments) AS draft_attachment_bytes`,
    ),
    env.DB.prepare(
      `SELECT COUNT(*) AS user_count,
              COALESCE(SUM(CASE WHEN storage_quota_bytes > 0
                THEN storage_quota_bytes ELSE 0 END), 0) AS quota_bytes,
              COALESCE(SUM(CASE WHEN storage_quota_bytes > 0
                THEN storage_used_bytes ELSE 0 END), 0) AS quota_used_bytes,
              SUM(CASE WHEN storage_quota_bytes = 0 THEN 1 ELSE 0 END) AS unlimited_users
         FROM users`,
    ),
    env.DB.prepare(
      `SELECT u.id, u.email, u.display_name, u.role,
              COUNT(DISTINCT CASE WHEN mb.is_hidden = 0 THEN mb.address END)
                AS mailbox_count,
              COUNT(m.id) AS message_count,
              u.storage_used_bytes AS used_bytes,
              u.storage_quota_bytes AS quota_bytes
         FROM users u
         LEFT JOIN mailboxes mb ON mb.user_id = u.id
         LEFT JOIN messages m ON m.mailbox_address = mb.address
        GROUP BY u.id
        ORDER BY used_bytes DESC, u.email
        LIMIT 8`,
    ),
    env.DB.prepare(
      `SELECT COALESCE(m.delivered_to, mb.address) AS address,
              u.email AS user_email,
              COUNT(m.id) AS message_count,
              COALESCE(SUM(m.quota_bytes), 0) AS used_bytes
         FROM mailboxes mb
         JOIN users u ON u.id = mb.user_id
         LEFT JOIN messages m ON m.mailbox_address = mb.address
        WHERE mb.is_hidden = 0 OR m.id IS NOT NULL
        GROUP BY COALESCE(m.delivered_to, mb.address), u.email
        ORDER BY used_bytes DESC, address
        LIMIT 8`,
    ),
    env.DB.prepare(
      "SELECT value FROM settings WHERE key = 'mail_refresh_interval'",
    ),
  ])

  const summary = (results[0].results[0] || {}) as unknown as Partial<SummaryRow>
  const dailyRows = results[1].results as unknown as DailyRow[]
  const dailyCounts = new Map(dailyRows.map((row) => [row.day, row.count]))
  const daily = Array.from({ length: days }, (_, index) => {
    const day = start + index * 86400
    return { day, count: dailyCounts.get(day) || 0 }
  })
  const storageMessages = (results[4].results[0] || {}) as unknown as Partial<StorageMessageRow>
  const storageAttachments = (results[5].results[0] || {}) as unknown as Partial<StorageAttachmentRow>
  const storageQuotas = (results[6].results[0] || {}) as unknown as Partial<StorageQuotaRow>
  const refreshSetting = (results[9].results[0] || {}) as unknown as { value?: string }
  const configuredInterval = Number(refreshSetting.value ?? 30)
  const refreshInterval = [0, 5, 10, 30, 60, 120].includes(configuredInterval)
    ? configuredInterval
    : 30

  return json({
    days,
    generatedAt: now,
    summary: {
      totalReceived: Number(summary.total_received || 0),
      periodReceived: Number(summary.period_received || 0),
      todayReceived: Number(summary.today_received || 0),
      uniqueSenders: Number(summary.unique_senders || 0),
    },
    daily,
    sourceDomains: results[2].results as unknown as SourceDomainRow[],
    topSenders: results[3].results as unknown as SenderRow[],
    platform: platformUsageEstimate({
      refreshInterval,
      messageCount: Number(storageMessages.message_count || 0),
      userCount: Number(storageQuotas.user_count || 0),
      todayReceived: Number(summary.today_received || 0),
      failedAttemptsToday: Number(storageMessages.failed_attempts_today || 0),
      usedBytes: Number(storageMessages.primary_bytes || 0)
        + Number(storageAttachments.draft_attachment_bytes || 0),
    }),
    storage: {
      messageCount: Number(storageMessages.message_count || 0),
      usedBytes: Number(storageMessages.used_bytes || 0),
      attachmentCount: Number(storageAttachments.attachment_count || 0),
      attachmentBytes: Number(storageAttachments.attachment_bytes || 0),
      trashCount: Number(storageMessages.trash_count || 0),
      trashBytes: Number(storageMessages.trash_bytes || 0),
      failedCount: Number(storageMessages.failed_count || 0),
      failedBytes: Number(storageMessages.failed_bytes || 0),
      userCount: Number(storageQuotas.user_count || 0),
      quotaBytes: Number(storageQuotas.quota_bytes || 0),
      quotaUsedBytes: Number(storageQuotas.quota_used_bytes || 0),
      unlimitedUsers: Number(storageQuotas.unlimited_users || 0),
      byUser: (results[7].results as unknown as StorageUserRow[]).map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        mailboxCount: Number(row.mailbox_count || 0),
        messageCount: Number(row.message_count || 0),
        usedBytes: Number(row.used_bytes || 0),
        quotaBytes: Number(row.quota_bytes || 0),
      })),
      byMailbox: (results[8].results as unknown as StorageMailboxRow[]).map((row) => ({
        address: row.address,
        userEmail: row.user_email,
        messageCount: Number(row.message_count || 0),
        usedBytes: Number(row.used_bytes || 0),
      })),
    },
  })
}
