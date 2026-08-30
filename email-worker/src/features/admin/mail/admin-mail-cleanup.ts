import { normalizeEmail, validEmail } from '../../../shared/http/api-helpers'
import { writeAudit } from '../../../shared/audit/audit'
import { permanentlyDeleteMessage } from '../../messages/message-storage'
import type { Env, SessionUser } from '../../../app/types'

export type CleanupScope = 'all' | 'user' | 'mailbox'
export type CleanupCategory = 'trash' | 'failed' | 'incoming' | 'sent' | 'all'

export type MailCleanupFilter = {
  scope: CleanupScope
  scopeValue: string
  category: CleanupCategory
  olderThanDays: number
}

type CleanupInput = {
  scope?: unknown
  scopeValue?: unknown
  category?: unknown
  olderThanDays?: unknown
}

type CleanupRequest = CleanupInput & {
  expectedCount?: unknown
  confirm?: unknown
}

type CleanupPreview = {
  messageCount: number
  bytes: number
  attachmentCount: number
  cutoff: number
}

const BATCH_LIMIT = 50
const scopes = new Set<CleanupScope>(['all', 'user', 'mailbox'])
const categories = new Set<CleanupCategory>(['trash', 'failed', 'incoming', 'sent', 'all'])

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function isAdministrator(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin'
}

export function normalizeCleanupFilter(input: CleanupInput): MailCleanupFilter | null {
  if (
    typeof input.scope !== 'string'
    || !scopes.has(input.scope as CleanupScope)
    || typeof input.category !== 'string'
    || !categories.has(input.category as CleanupCategory)
  ) return null
  const olderThanDays = Number(input.olderThanDays)
  if (!Number.isInteger(olderThanDays) || olderThanDays < 1 || olderThanDays > 3650) {
    return null
  }
  const scope = input.scope as CleanupScope
  const scopeValue = scope === 'all'
    ? ''
    : normalizeEmail(typeof input.scopeValue === 'string' ? input.scopeValue : '')
  if (scope !== 'all' && !validEmail(scopeValue)) return null
  return {
    scope,
    scopeValue,
    category: input.category as CleanupCategory,
    olderThanDays,
  }
}

function filterSql(filter: MailCleanupFilter, now: number) {
  const conditions = ["m.status != 'processing'"]
  const bindings: Array<string | number> = []
  if (filter.scope === 'user') {
    conditions.push('LOWER(u.email) = ?')
    bindings.push(filter.scopeValue)
  } else if (filter.scope === 'mailbox') {
    conditions.push('COALESCE(m.delivered_to, m.mailbox_address) = ?')
    bindings.push(filter.scopeValue)
  }
  if (filter.category === 'trash') conditions.push("m.folder = 'trash'")
  if (filter.category === 'failed') conditions.push("m.status = 'failed'")
  if (filter.category === 'incoming') conditions.push("m.direction = 'incoming'")
  if (filter.category === 'sent') conditions.push("m.direction = 'outgoing'")
  const cutoff = now - filter.olderThanDays * 24 * 60 * 60
  conditions.push('COALESCE(m.received_at, m.sent_at, m.created_at) <= ?')
  bindings.push(cutoff)
  return { where: conditions.join(' AND '), bindings, cutoff }
}

async function cleanupPreview(
  env: Env,
  filter: MailCleanupFilter,
  now: number,
): Promise<CleanupPreview> {
  const query = filterSql(filter, now)
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS message_count,
            COALESCE(SUM(m.quota_bytes), 0) AS bytes,
            COALESCE(SUM((
              SELECT COUNT(*) FROM attachments a WHERE a.message_id = m.id
            )), 0) AS attachment_count
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
       JOIN users u ON u.id = mb.user_id
      WHERE ${query.where}`,
  ).bind(...query.bindings).first<{
    message_count: number
    bytes: number
    attachment_count: number
  }>()
  return {
    messageCount: Number(row?.message_count || 0),
    bytes: Number(row?.bytes || 0),
    attachmentCount: Number(row?.attachment_count || 0),
    cutoff: query.cutoff,
  }
}

export async function previewAdminMailCleanup(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  if (!isAdministrator(user)) return json({ error: '只有管理员可以预估邮件清理。' }, 403)
  const params = new URL(request.url).searchParams
  const filter = normalizeCleanupFilter({
    scope: params.get('scope'),
    scopeValue: params.get('scopeValue'),
    category: params.get('category'),
    olderThanDays: params.get('olderThanDays'),
  })
  if (!filter) return json({ error: '邮件清理筛选条件无效。' }, 400)
  const preview = await cleanupPreview(env, filter, Math.floor(Date.now() / 1000))
  return json({ filter, preview, batchLimit: BATCH_LIMIT })
}

export async function runAdminMailCleanup(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(user)) return json({ error: '只有管理员可以清理邮件。' }, 403)
  const input = await request.json<CleanupRequest>()
    .catch(() => ({} as CleanupRequest))
  const filter = normalizeCleanupFilter(input)
  const expectedCount = Number(input.expectedCount)
  if (
    !filter
    || input.confirm !== true
    || !Number.isInteger(expectedCount)
    || expectedCount < 1
  ) return json({ error: '邮件清理确认信息无效。' }, 400)

  const now = Math.floor(Date.now() / 1000)
  const preview = await cleanupPreview(env, filter, now)
  if (preview.messageCount !== expectedCount) {
    return json({
      error: '邮件数据已经变化，请重新预估后再清理。',
      preview,
    }, 409)
  }
  const query = filterSql(filter, now)
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.raw_key, m.body_key, m.quota_bytes, mb.user_id
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
       JOIN users u ON u.id = mb.user_id
      WHERE ${query.where}
      ORDER BY COALESCE(m.received_at, m.sent_at, m.created_at), m.id
      LIMIT ?`,
  ).bind(...query.bindings, BATCH_LIMIT).all<{
    id: string
    raw_key: string | null
    body_key: string | null
    quota_bytes: number
    user_id: string
  }>()

  let deletedCount = 0
  let deletedBytes = 0
  try {
    for (const message of results) {
      if (await permanentlyDeleteMessage(env, message.user_id, message)) {
        deletedCount += 1
        deletedBytes += message.quota_bytes
      }
    }
  } catch (error) {
    await writeAudit(env, user.id, 'message.admin_cleanup', filter.scopeValue || 'all', ip, {
      ...filter,
      expectedCount,
      deletedCount,
      deletedBytes,
      status: 'partial_failure',
    })
    return json({
      error: `邮件清理未完整完成，已删除 ${deletedCount} 封，请重新预估。`,
    }, 502)
  }

  const remainingCount = Math.max(0, preview.messageCount - deletedCount)
  await writeAudit(env, user.id, 'message.admin_cleanup', filter.scopeValue || 'all', ip, {
    ...filter,
    expectedCount,
    deletedCount,
    deletedBytes,
    remainingCount,
    status: 'completed',
  })
  return json({ deletedCount, deletedBytes, remainingCount })
}
