import { writeAudit } from '../../shared/audit/audit'
import { permanentlyDeleteMessage } from './message-storage'
import { retentionValues } from '../admin/settings/storage-policy'
import type { Env, MessageRow, SessionUser } from '../../app/types'

export type BulkMessageAction =
  | 'read'
  | 'unread'
  | 'star'
  | 'unstar'
  | 'trash'
  | 'restore'
  | 'delete'

interface BulkMessageInput {
  ids: string[]
  action: BulkMessageAction
}

const actions = new Set<BulkMessageAction>([
  'read', 'unread', 'star', 'unstar', 'trash', 'restore', 'delete',
])

export function parseBulkMessageInput(value: unknown): BulkMessageInput | null {
  if (!value || typeof value !== 'object') return null
  const input = value as { ids?: unknown; action?: unknown }
  if (!Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 50) return null
  if (typeof input.action !== 'string' || !actions.has(input.action as BulkMessageAction)) {
    return null
  }
  const ids = [...new Set(input.ids)]
  if (ids.some((id) => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) {
    return null
  }
  return { ids: ids as string[], action: input.action as BulkMessageAction }
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}

async function deleteOwnedMessages(
  env: Env,
  userId: string,
  requestedIds: string[],
): Promise<number> {
  const marks = placeholders(requestedIds.length)
  const { results: messages } = await env.DB.prepare(
    `SELECT m.id, m.raw_key, m.body_key, m.quota_bytes
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
      WHERE mb.user_id = ? AND m.folder = 'trash' AND m.id IN (${marks})`,
  ).bind(userId, ...requestedIds).all<Pick<
    MessageRow,
    'id' | 'raw_key' | 'body_key' | 'quota_bytes'
  >>()
  if (!messages.length) return 0

  let deleted = 0
  for (const message of messages) {
    if (await permanentlyDeleteMessage(env, userId, message)) deleted += 1
  }
  return deleted
}

async function updateOwnedMessages(
  env: Env,
  userId: string,
  input: BulkMessageInput,
): Promise<number> {
  const marks = placeholders(input.ids.length)
  const scope = `id IN (${marks}) AND mailbox_address IN (
    SELECT address FROM mailboxes WHERE user_id = ?
  )`
  let sql = ''
  let leadingBindings: Array<string | number> = []
  if (input.action === 'read' || input.action === 'unread') {
    sql = `UPDATE messages SET is_read = ?, updated_at = unixepoch() WHERE ${scope}`
    leadingBindings = [input.action === 'read' ? 1 : 0]
  } else if (input.action === 'star' || input.action === 'unstar') {
    sql = `UPDATE messages SET is_starred = ?, updated_at = unixepoch() WHERE ${scope}`
    leadingBindings = [input.action === 'star' ? 1 : 0]
  } else if (input.action === 'trash') {
    const now = Math.floor(Date.now() / 1000)
    const { trashRetentionDays } = await retentionValues(env.DB)
    sql = `UPDATE messages
      SET folder = 'trash', trashed_at = COALESCE(trashed_at, ?),
          purge_after = COALESCE(trashed_at, ?) + ?, updated_at = unixepoch()
      WHERE ${scope}`
    leadingBindings = [now, now, trashRetentionDays * 86400]
  } else {
    sql = `UPDATE messages
      SET folder = CASE direction WHEN 'outgoing' THEN 'sent' ELSE 'inbox' END,
          trashed_at = NULL, purge_after = NULL, updated_at = unixepoch()
      WHERE ${scope} AND folder = 'trash'`
  }
  const result = await env.DB.prepare(sql)
    .bind(...leadingBindings, ...input.ids, userId).run()
  return Number(result.meta.changes || 0)
}

export async function bulkUpdateMessages(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  const input = parseBulkMessageInput(await request.json().catch(() => null))
  if (!input) {
    return Response.json({ error: '批量操作参数无效，单次最多选择 50 封邮件。' }, { status: 400 })
  }
  const updatedCount = input.action === 'delete'
    ? await deleteOwnedMessages(env, user.id, input.ids)
    : await updateOwnedMessages(env, user.id, input)
  await writeAudit(env, user.id, `message.bulk_${input.action}`, null, ip, {
    requestedCount: input.ids.length,
    updatedCount,
  })
  return Response.json({ ok: true, updatedCount })
}
