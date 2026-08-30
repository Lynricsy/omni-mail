import type { Env, MessageRow } from '../../app/types'

type StoredMessage = Pick<
  MessageRow,
  'id' | 'raw_key' | 'body_key' | 'quota_bytes'
>

export async function permanentlyDeleteMessage(
  env: Env,
  userId: string,
  message: StoredMessage,
): Promise<boolean> {
  const { results: attachments } = await env.DB.prepare(
    'SELECT r2_key FROM attachments WHERE message_id = ?',
  ).bind(message.id).all<{ r2_key: string }>()
  const { results: translations } = await env.DB.prepare(
    'SELECT r2_key FROM message_translations WHERE message_id = ?',
  ).bind(message.id).all<{ r2_key: string }>()
  const objectKeys = [
    message.raw_key,
    message.body_key,
    ...attachments.map((attachment) => attachment.r2_key),
    ...translations.map((translation) => translation.r2_key),
  ].filter((key): key is string => Boolean(key))
  const ownedMessage = `SELECT 1 FROM messages m
    JOIN mailboxes mb ON mb.address = m.mailbox_address
    WHERE m.id = ? AND mb.user_id = ?`
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE users
          SET storage_used_bytes = MAX(0, storage_used_bytes - ?),
              updated_at = unixepoch()
        WHERE id = ? AND EXISTS (${ownedMessage})`,
    ).bind(message.quota_bytes, userId, message.id, userId),
    env.DB.prepare(
      `INSERT OR IGNORE INTO pending_object_deletions (object_key)
       SELECT value FROM json_each(?) WHERE EXISTS (${ownedMessage})`,
    ).bind(JSON.stringify(objectKeys), message.id, userId),
    env.DB.prepare(
      `DELETE FROM messages WHERE id = ? AND mailbox_address IN (
        SELECT address FROM mailboxes WHERE user_id = ?
      )`,
    ).bind(message.id, userId),
  ])
  const deleted = Boolean(results.at(-1)?.meta.changes)
  if (!deleted) return false
  await deleteStagedObjects(env, objectKeys)
  return true
}

export async function deleteStagedObjects(env: Env, objectKeys: string[]): Promise<void> {
  if (!objectKeys.length) return
  try {
    for (let offset = 0; offset < objectKeys.length; offset += 1000) {
      await env.MAIL_BUCKET.delete(objectKeys.slice(offset, offset + 1000))
    }
    for (let offset = 0; offset < objectKeys.length; offset += 100) {
      const keys = objectKeys.slice(offset, offset + 100)
      const marks = keys.map(() => '?').join(', ')
      await env.DB.prepare(
        `DELETE FROM pending_object_deletions WHERE object_key IN (${marks})`,
      ).bind(...keys).run()
    }
  } catch (error) {
    console.error('Unable to remove staged R2 objects', error)
  }
}

export async function purgePendingObjectDeletions(env: Env): Promise<number> {
  const { results } = await env.DB.prepare(
    'SELECT object_key FROM pending_object_deletions ORDER BY created_at, object_key LIMIT 1000',
  ).all<{ object_key: string }>()
  const keys = results.map((row) => row.object_key)
  await deleteStagedObjects(env, keys)
  return keys.length
}

export async function reserveStorage(
  db: D1Database,
  userId: string,
  bytes: number,
): Promise<boolean> {
  const result = await db.prepare(
    `UPDATE users
        SET storage_used_bytes = storage_used_bytes + ?,
            updated_at = unixepoch()
      WHERE id = ?
        AND status = 'active'
        AND deleted_at IS NULL
        AND (storage_quota_bytes = 0 OR storage_used_bytes + ? <= storage_quota_bytes)`,
  ).bind(bytes, userId, bytes).run()
  return Boolean(result.meta.changes)
}

export async function releaseStorage(
  db: D1Database,
  userId: string,
  bytes: number,
): Promise<void> {
  await db.prepare(
    `UPDATE users
        SET storage_used_bytes = MAX(0, storage_used_bytes - ?),
            updated_at = unixepoch()
      WHERE id = ?`,
  ).bind(bytes, userId).run()
}
