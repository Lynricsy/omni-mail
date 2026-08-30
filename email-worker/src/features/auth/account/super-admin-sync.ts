import type { Env } from '../../../app/types'

const SYNC_SETTING = 'super_admin_identity'
let activeSync: { email: string; promise: Promise<void> } | undefined

async function syncIdentity(env: Env, email: string): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM settings
     WHERE key IN ('setup_complete', ?)`,
  ).bind(SYNC_SETTING).all<{ key: string; value: string }>()
  const settings = new Map(results.map((row) => [row.key, row.value]))
  if (settings.get('setup_complete') !== '1' || settings.get(SYNC_SETTING) === email) return

  const target = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?',
  ).bind(email).first<{ id: string }>()
  let ownerId = target?.id
  if (target) {
    await env.DB.prepare(
      "UPDATE users SET role = 'admin', updated_at = unixepoch() WHERE role = 'super_admin' AND id != ?",
    ).bind(target.id).run()
  } else {
    const current = await env.DB.prepare(
      `SELECT id FROM users
        WHERE role IN ('super_admin', 'admin')
        ORDER BY CASE role WHEN 'super_admin' THEN 0 ELSE 1 END, created_at
        LIMIT 1`,
    ).first<{ id: string }>()
    if (!current) return
    ownerId = current.id
    await env.DB.prepare(
      'UPDATE users SET email = ?, updated_at = unixepoch() WHERE id = ?',
    ).bind(email, current.id).run()
  }

  if (ownerId) {
    await env.DB.prepare(
      'UPDATE mailboxes SET user_id = ? WHERE is_hidden = 1 AND user_id != ?',
    ).bind(ownerId, ownerId).run()
  }

  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).bind(SYNC_SETTING, email).run()
}

export function syncSuperAdminIdentity(env: Env, email: string): Promise<void> {
  if (!email) return Promise.resolve()
  if (activeSync?.email === email) return activeSync.promise
  const promise = syncIdentity(env, email).catch((error) => {
    activeSync = undefined
    throw error
  })
  activeSync = { email, promise }
  return promise
}
