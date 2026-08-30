import { normalizeEmail, safeJsonArray, validEmail } from '../../shared/http/api-helpers'
import { searchLikePattern } from '../../shared/mail/message-search'
import { pageResult, parsePageRequest } from '../../shared/http/pagination'
import type { Env, MessageRow, SessionUser } from '../../app/types'

type SummaryFields = Pick<
  MessageRow,
  | 'id'
  | 'mailbox_address'
  | 'direction'
  | 'status'
  | 'folder'
  | 'sender_name'
  | 'sender_address'
  | 'delivered_to'
  | 'recipients_json'
  | 'subject'
  | 'preview'
  | 'received_at'
  | 'sent_at'
  | 'attachment_count'
  | 'is_read'
  | 'is_starred'
  | 'processing_error'
  | 'delivery_status'
  | 'purge_after'
  | 'created_at'
>

type SummaryRow = SummaryFields & { sort_time: number }
type CountsRow = {
  unread: number | null
  starred: number | null
  sent: number | null
  trash: number | null
  drafts: number | null
}

const UNASSIGNED_MAILBOX = '__unassigned__@omnimail.invalid'

export function canViewUnassignedMail(user: SessionUser): boolean {
  return user.role === 'super_admin'
}

export function parseSyncVersion(value: string | null): number | null | undefined {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

export function messageSummary(row: SummaryFields) {
  return {
    id: row.id,
    mailboxAddress: row.delivered_to || row.mailbox_address,
    direction: row.direction,
    status: row.status,
    folder: row.folder,
    senderName: row.sender_name || '',
    senderAddress: row.sender_address,
    recipients: safeJsonArray(row.recipients_json),
    subject: row.subject || '无主题',
    preview: row.preview,
    date: (row.received_at ?? row.sent_at ?? row.created_at) * 1000,
    attachmentCount: row.attachment_count,
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    processingError: row.processing_error,
    deliveryStatus: row.delivery_status,
    purgeAfter: row.purge_after ? row.purge_after * 1000 : null,
  }
}

export async function listMessages(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  const params = new URL(request.url).searchParams
  const syncVersion = parseSyncVersion(params.get('version'))
  if (syncVersion === undefined) {
    return Response.json({ error: '邮件同步版本无效。' }, { status: 400 })
  }
  const versionRow = await env.DB.prepare(
    'SELECT version FROM mail_state_versions WHERE user_id = ?',
  ).bind(user.id).first<{ version: number }>()
  const version = Number(versionRow?.version || 0)
  if (syncVersion !== null && syncVersion === version) {
    return Response.json({ unchanged: true, version })
  }
  const pagination = parsePageRequest(request, 2)
  if (!pagination) {
    return Response.json({ error: '分页参数无效，limit 需要在 1–100 之间。' }, { status: 400 })
  }
  const folder = params.get('folder') || 'inbox'
  const query = (params.get('q') || '').trim().slice(0, 120)
  const mailbox = normalizeEmail(params.get('mailbox') || '')
  const domain = (params.get('domain') || '').trim().toLowerCase().slice(0, 253)
  const scopeConditions = ['mb.user_id = ?']
  const scopeBindings: Array<string | number> = [user.id]
  if (canViewUnassignedMail(user)) {
    scopeConditions.push('(mb.is_hidden = 0 OR mb.address = ?)')
    scopeBindings.push(UNASSIGNED_MAILBOX)
  } else {
    scopeConditions.push('mb.is_hidden = 0')
  }

  if (mailbox) {
    if (!validEmail(mailbox)) {
      return Response.json({ error: '邮箱筛选条件无效。' }, { status: 400 })
    }
    scopeConditions.push('COALESCE(m.delivered_to, m.mailbox_address) = ?')
    scopeBindings.push(mailbox)
  } else if (domain) {
    scopeConditions.push(
      `substr(
        lower(COALESCE(m.delivered_to, m.mailbox_address)),
        instr(COALESCE(m.delivered_to, m.mailbox_address), '@') + 1
      ) = ?`,
    )
    scopeBindings.push(domain)
  }

  const conditions = [...scopeConditions]
  const bindings = [...scopeBindings]
  if (folder === 'starred') {
    conditions.push('m.is_starred = 1', "m.folder != 'trash'")
  } else if (folder === 'sent') {
    conditions.push("m.direction = 'outgoing'", "m.folder = 'sent'")
  } else if (folder === 'trash') {
    conditions.push("m.folder = 'trash'")
  } else {
    conditions.push("m.direction = 'incoming'", "m.folder = 'inbox'")
  }

  if (query) {
    const pattern = searchLikePattern(query)
    conditions.push(
      `(EXISTS (
        SELECT 1 FROM message_search ms
         WHERE ms.message_id = m.id AND ms.content LIKE ? ESCAPE '\\'
      ) OR m.subject LIKE ? ESCAPE '\\'
        OR m.sender_address LIKE ? ESCAPE '\\'
        OR m.sender_name LIKE ? ESCAPE '\\')`,
    )
    bindings.push(pattern, pattern, pattern, pattern)
  }

  if (pagination.cursor) {
    const [sortTime, id] = pagination.cursor.values
    if (
      typeof sortTime !== 'number'
      || !Number.isSafeInteger(sortTime)
      || sortTime < 0
      || typeof id !== 'string'
      || !id
      || id.length > 100
    ) {
      return Response.json({ error: '邮件分页游标无效。' }, { status: 400 })
    }
    conditions.push(
      '(m.sort_at < ? OR (m.sort_at = ? AND m.id < ?))',
    )
    bindings.push(sortTime, sortTime, id)
  }

  const messagesStatement = env.DB.prepare(
    `SELECT
       m.id, m.mailbox_address, m.direction, m.status, m.folder,
       m.sender_name, m.sender_address, m.delivered_to, m.recipients_json,
       m.subject, m.preview,
       m.received_at, m.sent_at, m.attachment_count, m.is_read, m.is_starred,
       m.processing_error, m.delivery_status, m.purge_after, m.created_at,
       m.sort_at AS sort_time
     FROM messages m
     JOIN mailboxes mb ON mb.address = m.mailbox_address
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.sort_at DESC, m.id DESC
     LIMIT ?`,
  ).bind(...bindings, pagination.limit + 1)
  const countsStatement = env.DB.prepare(
    `SELECT
       SUM(CASE WHEN m.direction = 'incoming' AND m.folder = 'inbox' AND m.is_read = 0 THEN 1 ELSE 0 END) AS unread,
       SUM(CASE WHEN m.is_starred = 1 AND m.folder != 'trash' THEN 1 ELSE 0 END) AS starred,
       SUM(CASE WHEN m.direction = 'outgoing' AND m.folder = 'sent' THEN 1 ELSE 0 END) AS sent,
       SUM(CASE WHEN m.folder = 'trash' THEN 1 ELSE 0 END) AS trash,
       (SELECT COUNT(*) FROM mail_drafts d WHERE d.user_id = ?) AS drafts
     FROM messages m
     JOIN mailboxes mb ON mb.address = m.mailbox_address
     WHERE ${scopeConditions.join(' AND ')}`,
  ).bind(user.id, ...scopeBindings)
  const [messagesResult, countsResult] = await env.DB.batch<SummaryRow | CountsRow>([
    messagesStatement,
    countsStatement,
  ])
  const result = pageResult(
    messagesResult.results as SummaryRow[],
    pagination.limit,
    (row) => [row.sort_time, row.id],
  )
  const counts = countsResult.results[0] as CountsRow | undefined

  return Response.json({
    unchanged: false,
    version,
    messages: result.items.map(messageSummary),
    counts: {
      unread: counts?.unread ?? 0,
      starred: counts?.starred ?? 0,
      sent: counts?.sent ?? 0,
      trash: counts?.trash ?? 0,
      drafts: counts?.drafts ?? 0,
    },
    page: result.page,
  })
}
