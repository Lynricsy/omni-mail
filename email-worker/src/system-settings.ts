import { writeAudit } from './audit'
import type { Env, SessionUser } from './types'

export type MailRefreshInterval = 0 | 5 | 10 | 30 | 60 | 120

const REFRESH_SETTING = 'mail_refresh_interval'
const REMOTE_IMAGES_SETTING = 'remote_images_enabled'
const UNASSIGNED_MAIL_SETTING = 'unassigned_mail_enabled'
const DEFAULT_REFRESH_INTERVAL: MailRefreshInterval = 30
const REFRESH_INTERVALS = new Set<MailRefreshInterval>([0, 5, 10, 30, 60, 120])

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function isAdministrator(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin'
}

export function parseMailRefreshInterval(value: unknown): MailRefreshInterval | null {
  return typeof value === 'number' && REFRESH_INTERVALS.has(value as MailRefreshInterval)
    ? value as MailRefreshInterval
    : null
}

export function parseRemoteImagesEnabled(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function parseUnassignedMailEnabled(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export async function mailRefreshInterval(db: D1Database): Promise<MailRefreshInterval> {
  const setting = await db.prepare(
    'SELECT value FROM settings WHERE key = ?',
  ).bind(REFRESH_SETTING).first<{ value: string }>()
  return parseMailRefreshInterval(Number(setting?.value)) ?? DEFAULT_REFRESH_INTERVAL
}

export async function remoteImagesEnabled(db: D1Database): Promise<boolean> {
  const setting = await db.prepare(
    'SELECT value FROM settings WHERE key = ?',
  ).bind(REMOTE_IMAGES_SETTING).first<{ value: string }>()
  return setting?.value === '1'
}

export async function updateMailRefreshInterval(
  env: Env,
  actor: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) {
    return json({ error: '只有管理员可以修改自动刷新设置。' }, 403)
  }
  const body = await request.json<{ interval?: unknown }>()
    .catch(() => ({} as { interval?: unknown }))
  const interval = parseMailRefreshInterval(body.interval)
  if (interval === null) {
    return json({ error: '自动刷新档位无效。' }, 400)
  }
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
  ).bind(REFRESH_SETTING, String(interval)).run()
  await writeAudit(env, actor.id, 'system.mail_refresh.update', null, ip, { interval })
  return json({ mailRefreshInterval: interval })
}

export async function updateRemoteImagesSetting(
  env: Env,
  actor: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) {
    return json({ error: '只有管理员可以修改远程图片设置。' }, 403)
  }
  const body = await request.json<{ enabled?: unknown }>()
    .catch(() => ({} as { enabled?: unknown }))
  const enabled = parseRemoteImagesEnabled(body.enabled)
  if (enabled === null) {
    return json({ error: '远程图片设置无效。' }, 400)
  }
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
  ).bind(REMOTE_IMAGES_SETTING, enabled ? '1' : '0').run()
  await writeAudit(env, actor.id, 'system.remote_images.update', null, ip, { enabled })
  return json({ remoteImagesEnabled: enabled })
}

export async function updateUnassignedMailSetting(
  env: Env,
  actor: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) {
    return json({ error: '只有管理员可以修改无人收件设置。' }, 403)
  }
  const body = await request.json<{ enabled?: unknown }>()
    .catch(() => ({} as { enabled?: unknown }))
  const enabled = parseUnassignedMailEnabled(body.enabled)
  if (enabled === null) {
    return json({ error: '无人收件设置无效。' }, 400)
  }
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
  ).bind(UNASSIGNED_MAIL_SETTING, enabled ? '1' : '0').run()
  await writeAudit(env, actor.id, 'system.unassigned_mail.update', null, ip, { enabled })
  return json({ unassignedMailEnabled: enabled })
}
