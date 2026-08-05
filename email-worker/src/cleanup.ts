import { expireTemporaryAccounts } from './account-api'
import { purgeUserDraft } from './draft-api'
import { permanentlyDeleteMessage } from './message-storage'
import { enqueueMissingMessageSearch } from './message-search'
import { ensureSchema } from './schema'
import { startScheduledBackup } from './storage-policy'
import type { Env } from './types'

const CLEANUP_INTERVAL_SECONDS = 6 * 60 * 60
export const CLEANUP_BATCH_SIZE = 20

export async function claimRetentionCleanup(db: D1Database, now: number): Promise<boolean> {
  const result = await db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('last_retention_cleanup_at', ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at
     WHERE CAST(settings.value AS INTEGER) <= ?`,
  ).bind(String(now), now, now - CLEANUP_INTERVAL_SECONDS).run()
  if (result.meta.changes) {
    await db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('retention_cleanup_pending', '1', ?)
       ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at`,
    ).bind(now).run()
  }
  return Boolean(result.meta.changes)
}

export async function releaseRetentionClaim(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare(
      `UPDATE settings SET value = ?, updated_at = ?
        WHERE key = 'last_retention_cleanup_at' AND value = ?`,
    ).bind(String(now - CLEANUP_INTERVAL_SECONDS), now, String(now)),
    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('retention_cleanup_pending', '1', ?)
       ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at`,
    ).bind(now),
  ])
}

export async function completeRetentionCleanup(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('retention_cleanup_pending', '0', ?)
       ON CONFLICT(key) DO UPDATE SET value = '0', updated_at = excluded.updated_at`,
    ).bind(now),
    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('last_retention_cleanup_succeeded_at', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(String(now), now),
  ])
}

export async function purgeMessagesBatch(
  env: Env,
  kind: 'expired' | 'failed',
  cutoff: number,
): Promise<number> {
  const where = kind === 'expired'
    ? 'm.purge_after IS NOT NULL AND m.purge_after <= ?'
    : "m.status = 'failed' AND m.updated_at <= ?"
  const { results } = await env.DB.prepare(
    `SELECT m.id, m.raw_key, m.body_key, m.quota_bytes, mb.user_id
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
      WHERE ${where}
      ORDER BY m.updated_at, m.id
      LIMIT ?`,
  ).bind(cutoff, CLEANUP_BATCH_SIZE).all<{
    id: string
    raw_key: string | null
    body_key: string | null
    quota_bytes: number
    user_id: string
  }>()
  for (const message of results) {
    await permanentlyDeleteMessage(env, message.user_id, message)
  }
  return results.length
}

export async function purgeDeletedAccountBatch(env: Env, cutoff: number): Promise<boolean> {
  const user = await env.DB.prepare(
    `SELECT id FROM users
      WHERE role IN ('user', 'temporary') AND deleted_at IS NOT NULL AND deleted_at <= ?
      ORDER BY deleted_at, id
      LIMIT 1`,
  ).bind(cutoff).first<{ id: string }>()
  if (!user) return false
  const { results: messages } = await env.DB.prepare(
    `SELECT m.id, m.raw_key, m.body_key, m.quota_bytes
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
      WHERE mb.user_id = ?
      ORDER BY m.id
      LIMIT ?`,
  ).bind(user.id, CLEANUP_BATCH_SIZE).all<{
    id: string
    raw_key: string | null
    body_key: string | null
    quota_bytes: number
  }>()
  for (const message of messages) {
    await permanentlyDeleteMessage(env, user.id, message)
  }
  if (messages.length) return true
  await purgeUserDraft(env, user.id)
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO audit_logs (action, target_id, ip, detail_json)
       VALUES ('account.purge', ?, 'workflow', '{"reason":"retention"}')`,
    ).bind(user.id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ])
  return true
}

async function startRetentionCleanup(env: Env, now: number): Promise<void> {
  if (!await claimRetentionCleanup(env.DB, now)) return
  if (!env.CLEANUP_WORKFLOW) {
    await releaseRetentionClaim(env.DB, now)
    throw new Error('CLEANUP_WORKFLOW is not configured')
  }
  try {
    await env.CLEANUP_WORKFLOW.create({
      id: `retention-${Math.floor(now / CLEANUP_INTERVAL_SECONDS)}`,
      params: { startedAt: now },
      retention: { successRetention: '3 days', errorRetention: '7 days' },
    })
  } catch (error) {
    await releaseRetentionClaim(env.DB, now)
    throw error
  }
}

export async function cleanup(env: Env): Promise<void> {
  await ensureSchema(env.DB)
  const now = Math.floor(Date.now() / 1000)
  await expireTemporaryAccounts(env, now)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM device_sessions WHERE refresh_expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM mfa_challenges WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM login_attempts WHERE window_started_at < ?')
      .bind(now - 24 * 60 * 60),
    env.DB.prepare('DELETE FROM registration_attempts WHERE window_started_at < ?')
      .bind(now - 2 * 24 * 60 * 60),
    env.DB.prepare('DELETE FROM outbound_rate_limits WHERE updated_at < ?')
      .bind(now - 2 * 24 * 60 * 60),
  ])
  try {
    await enqueueMissingMessageSearch(env)
  } catch (error) {
    console.error('Unable to enqueue message search backfill', error)
  }
  await startScheduledBackup(env, now)
  await startRetentionCleanup(env, now)
}
