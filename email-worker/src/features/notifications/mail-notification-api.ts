import type { Env, SessionUser } from '../../app/types'

const SOURCES = [
  'omnimail', 'icloud', 'linuxdo', 'gmail', 'microsoft', 'qq', 'naver', 'yandex',
] as const
type NotificationSource = typeof SOURCES[number]

const MESSAGE_SELECTS: Record<NotificationSource, string> = {
  omnimail: `SELECT 'omnimail' AS source, '' AS account_id, m.id AS message_id,
    m.sender_name, m.sender_address, m.subject, COALESCE(m.received_at, m.created_at) AS message_date,
    m.is_read
    FROM messages m JOIN mailboxes mb ON mb.address = m.mailbox_address
    WHERE mb.user_id = ? AND m.direction = 'incoming' AND m.folder = 'inbox' AND m.status = 'ready'`,
  icloud: `SELECT 'icloud' AS source, a.id AS account_id, CAST(m.imap_uid AS TEXT) AS message_id,
    m.sender_name, m.sender_address, m.subject, m.internal_date AS message_date, m.is_read
    FROM icloud_imap_messages m JOIN icloud_accounts a ON a.id = m.account_id
    WHERE a.user_id = ? AND a.app_password_cipher <> ''`,
  linuxdo: `SELECT 'linuxdo' AS source, a.id AS account_id, CAST(m.imap_uid AS TEXT) AS message_id,
    m.sender_name, m.sender_address, m.subject, m.internal_date AS message_date, m.is_read
    FROM linux_do_mail_messages m JOIN linux_do_mail_accounts a ON a.id = m.account_id
    WHERE a.user_id = ?`,
  gmail: `SELECT 'gmail' AS source, a.id AS account_id, m.id AS message_id,
    m.sender_name, m.sender_address, m.subject, m.internal_date AS message_date, m.is_read
    FROM gmail_imap_messages m JOIN gmail_imap_accounts a ON a.id = m.account_id
    WHERE a.user_id = ?`,
  microsoft: `SELECT 'microsoft' AS source, a.id AS account_id, m.id AS message_id,
    m.sender_name, m.sender_address, m.subject, m.received_at AS message_date, m.is_read
    FROM microsoft_imap_messages m JOIN microsoft_imap_accounts a ON a.id = m.account_id
    WHERE a.user_id = ? AND m.folder_path = 'INBOX' COLLATE NOCASE`,
  qq: `SELECT 'qq' AS source, a.id AS account_id, m.id AS message_id,
    m.sender_name, m.sender_address, m.subject, m.internal_date AS message_date, m.is_read
    FROM qq_mail_messages m JOIN qq_mail_accounts a ON a.id = m.account_id
    WHERE a.user_id = ?`,
  naver: `SELECT 'naver' AS source, a.id AS account_id, m.id AS message_id,
    m.sender_name, m.sender_address, m.subject, m.internal_date AS message_date, m.is_read
    FROM naver_mail_messages m JOIN naver_mail_accounts a ON a.id = m.account_id
    WHERE a.user_id = ?`,
  yandex: `SELECT 'yandex' AS source, a.id AS account_id, m.id AS message_id,
    m.sender_name, m.sender_address, m.subject, m.internal_date AS message_date, m.is_read
    FROM yandex_mail_messages m JOIN yandex_mail_accounts a ON a.id = m.account_id
    WHERE a.user_id = ?`,
}

const SOURCE_SELECTS: Record<Exclude<NotificationSource, 'omnimail'>, string> = {
  icloud: `SELECT DISTINCT 'icloud' AS source FROM icloud_accounts
    WHERE user_id = ? AND app_password_cipher <> ''`,
  linuxdo: `SELECT DISTINCT 'linuxdo' AS source FROM linux_do_mail_accounts WHERE user_id = ?`,
  gmail: `SELECT DISTINCT 'gmail' AS source FROM gmail_imap_accounts WHERE user_id = ?`,
  microsoft: `SELECT DISTINCT 'microsoft' AS source FROM microsoft_imap_accounts WHERE user_id = ?`,
  qq: `SELECT DISTINCT 'qq' AS source FROM qq_mail_accounts WHERE user_id = ?`,
  naver: `SELECT DISTINCT 'naver' AS source FROM naver_mail_accounts WHERE user_id = ?`,
  yandex: `SELECT DISTINCT 'yandex' AS source FROM yandex_mail_accounts WHERE user_id = ?`,
}

interface NotificationRow {
  source: NotificationSource
  account_id: string
  message_id: string
  sender_name: string
  sender_address: string
  subject: string
  message_date: number
  is_read: number
  unread_total?: number
}

function requestedSources(request: Request): NotificationSource[] {
  const value = new URL(request.url).searchParams.get('sources')
  if (!value?.trim()) return [...SOURCES]
  const requested = value
    .split(',').filter((value): value is NotificationSource => (
      SOURCES.includes(value as NotificationSource)
    ))
  return [...new Set(requested)]
}

export async function listMailNotifications(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  const selected = requestedSources(request)
  const limitValue = Number.parseInt(new URL(request.url).searchParams.get('limit') || '', 10)
  const limit = Number.isSafeInteger(limitValue) ? Math.max(1, Math.min(100, limitValue)) : 50
  if (!selected.length) {
    return Response.json(
      { messages: [], sources: [], unread: 0 },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  const messageSql = selected.map((source) => MESSAGE_SELECTS[source]).join(' UNION ALL ')
  const messageBindings = selected.map(() => user.id)
  const { results } = await env.DB.prepare(
    `SELECT indexed.*, SUM(CASE WHEN indexed.is_read = 0 THEN 1 ELSE 0 END) OVER () AS unread_total
       FROM (${messageSql}) indexed
      ORDER BY message_date DESC, message_id DESC LIMIT ?`,
  ).bind(...messageBindings, limit).all<NotificationRow>()

  const external = selected.filter((source): source is Exclude<NotificationSource, 'omnimail'> => (
    source !== 'omnimail'
  ))
  const available = external.length
    ? (await env.DB.prepare(external.map((source) => SOURCE_SELECTS[source]).join(' UNION ALL '))
      .bind(...external.map(() => user.id)).all<{ source: NotificationSource }>()).results
      .map(({ source }) => source)
    : []
  const sources = [...new Set<NotificationSource>([
    ...(selected.includes('omnimail') ? ['omnimail' as const] : []),
    ...available,
  ])]
  return Response.json({
    messages: results.map((row) => ({
      source: row.source,
      accountId: row.account_id,
      messageId: row.message_id,
      senderName: row.sender_name,
      senderAddress: row.sender_address,
      subject: row.subject,
      date: row.message_date,
      isRead: Boolean(row.is_read),
    })),
    sources,
    unread: Number(results[0]?.unread_total ?? results.filter(({ is_read }) => !is_read).length),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
