import type { Env, MessageRow } from './types'

type StoredMessage = Pick<
  MessageRow,
  'id' | 'raw_key' | 'body_key' | 'quota_bytes'
>

export async function permanentlyDeleteMessage(
  env: Env,
  userId: string,
  message: StoredMessage,
): Promise<void> {
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
  if (objectKeys.length) await env.MAIL_BUCKET.delete(objectKeys)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(message.id),
    env.DB.prepare(
      `UPDATE users
          SET storage_used_bytes = MAX(0, storage_used_bytes - ?),
              updated_at = unixepoch()
        WHERE id = ?`,
    ).bind(message.quota_bytes, userId),
  ])
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
