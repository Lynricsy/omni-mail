import { writeAudit } from '../../../shared/audit/audit'
import type { Env, SessionUser } from '../../../app/types'

export type MailRefreshInterval = 0 | 5 | 10 | 30 | 60 | 120

const REFRESH_SETTING = 'mail_refresh_interval'
const REMOTE_IMAGES_SETTING = 'remote_images_enabled'
const UNASSIGNED_MAIL_SETTING = 'unassigned_mail_enabled'
const OFFICIAL_EXTENSION_SETTING = 'official_extension_enabled'
const RANDOM_MAILBOX_PREFIX_SETTING = 'random_mailbox_prefix'
const ICLOUD_WORKSPACE_SETTING = 'icloud_workspace_enabled'
const LINUX_DO_MAIL_WORKSPACE_SETTING = 'linuxdo_mail_workspace_enabled'
const GMAIL_WORKSPACE_SETTING = 'gmail_workspace_enabled'
const MICROSOFT_WORKSPACE_SETTING = 'microsoft_workspace_enabled'
const QQ_MAIL_WORKSPACE_SETTING = 'qq_mail_workspace_enabled'
const NAVER_MAIL_WORKSPACE_SETTING = 'naver_mail_workspace_enabled'
const YANDEX_MAIL_WORKSPACE_SETTING = 'yandex_mail_workspace_enabled'
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

export function parseOfficialExtensionEnabled(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function parseMailWorkspaceEnabled(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function parseRandomMailboxPrefix(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const prefix = value.trim().toLowerCase()
  return prefix === '' || /^[a-z0-9][a-z0-9._+-]{0,19}$/.test(prefix)
    ? prefix
    : null
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

export async function officialExtensionEnabled(db: D1Database): Promise<boolean> {
  try {
    const setting = await db.prepare(
      'SELECT value FROM settings WHERE key = ?',
    ).bind(OFFICIAL_EXTENSION_SETTING).first<{ value: string }>()
    return setting?.value === '1'
  } catch {
    return false
  }
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

export async function updateOfficialExtensionSetting(
  env: Env,
  actor: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (actor.role !== 'super_admin') {
    return json({ error: '只有主管理员可以修改官方浏览器扩展设置。' }, 403)
  }
  const body = await request.json<{ enabled?: unknown }>()
    .catch(() => ({} as { enabled?: unknown }))
  const enabled = parseOfficialExtensionEnabled(body.enabled)
  if (enabled === null) {
    return json({ error: '官方浏览器扩展设置无效。' }, 400)
  }
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
  ).bind(OFFICIAL_EXTENSION_SETTING, enabled ? '1' : '0').run()
  await writeAudit(env, actor.id, 'system.official_extension.update', null, ip, { enabled })
  return json({ officialExtensionEnabled: enabled })
}

export async function updateMailWorkspaceSettings(
  env: Env,
  actor: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) {
    return json({ error: '只有管理员可以修改邮箱功能入口。' }, 403)
  }
  const body = await request.json<{
    iCloudWorkspaceEnabled?: unknown
    linuxDoMailWorkspaceEnabled?: unknown
    gmailWorkspaceEnabled?: unknown
    microsoftWorkspaceEnabled?: unknown
    qqMailWorkspaceEnabled?: unknown
    naverMailWorkspaceEnabled?: unknown
    yandexMailWorkspaceEnabled?: unknown
  }>().catch(() => ({} as {
    iCloudWorkspaceEnabled?: unknown
    linuxDoMailWorkspaceEnabled?: unknown
    gmailWorkspaceEnabled?: unknown
    microsoftWorkspaceEnabled?: unknown
    qqMailWorkspaceEnabled?: unknown
    naverMailWorkspaceEnabled?: unknown
    yandexMailWorkspaceEnabled?: unknown
  }))
  const iCloudWorkspaceEnabled = parseMailWorkspaceEnabled(body.iCloudWorkspaceEnabled)
  const linuxDoMailWorkspaceEnabled = parseMailWorkspaceEnabled(
    body.linuxDoMailWorkspaceEnabled,
  )
  const gmailWorkspaceEnabled = parseMailWorkspaceEnabled(body.gmailWorkspaceEnabled)
  const microsoftWorkspaceEnabled = parseMailWorkspaceEnabled(body.microsoftWorkspaceEnabled)
  const qqMailWorkspaceEnabled = parseMailWorkspaceEnabled(body.qqMailWorkspaceEnabled)
  const naverMailWorkspaceEnabled = parseMailWorkspaceEnabled(body.naverMailWorkspaceEnabled)
  const yandexMailWorkspaceEnabled = parseMailWorkspaceEnabled(body.yandexMailWorkspaceEnabled)
  if (
    iCloudWorkspaceEnabled === null
    || linuxDoMailWorkspaceEnabled === null
    || gmailWorkspaceEnabled === null
    || microsoftWorkspaceEnabled === null
    || qqMailWorkspaceEnabled === null
    || naverMailWorkspaceEnabled === null
    || yandexMailWorkspaceEnabled === null
  ) {
    return json({ error: '邮箱功能入口设置无效。' }, 400)
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind(ICLOUD_WORKSPACE_SETTING, iCloudWorkspaceEnabled ? '1' : '0'),
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind(LINUX_DO_MAIL_WORKSPACE_SETTING, linuxDoMailWorkspaceEnabled ? '1' : '0'),
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind(GMAIL_WORKSPACE_SETTING, gmailWorkspaceEnabled ? '1' : '0'),
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind(MICROSOFT_WORKSPACE_SETTING, microsoftWorkspaceEnabled ? '1' : '0'),
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind(QQ_MAIL_WORKSPACE_SETTING, qqMailWorkspaceEnabled ? '1' : '0'),
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind(NAVER_MAIL_WORKSPACE_SETTING, naverMailWorkspaceEnabled ? '1' : '0'),
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind(YANDEX_MAIL_WORKSPACE_SETTING, yandexMailWorkspaceEnabled ? '1' : '0'),
  ])
  const settings = {
    iCloudWorkspaceEnabled,
    linuxDoMailWorkspaceEnabled,
    gmailWorkspaceEnabled,
    microsoftWorkspaceEnabled,
    qqMailWorkspaceEnabled,
    naverMailWorkspaceEnabled,
    yandexMailWorkspaceEnabled,
  }
  await writeAudit(env, actor.id, 'system.mail_workspaces.update', null, ip, settings)
  return json(settings)
}

export async function updateRandomMailboxPrefix(
  env: Env,
  actor: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) {
    return json({ error: '只有管理员可以修改随机邮箱格式。' }, 403)
  }
  const body = await request.json<{ prefix?: unknown }>()
    .catch(() => ({} as { prefix?: unknown }))
  const prefix = parseRandomMailboxPrefix(body.prefix)
  if (prefix === null) {
    return json({ error: '随机邮箱前缀格式无效。' }, 400)
  }
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
  ).bind(RANDOM_MAILBOX_PREFIX_SETTING, prefix).run()
  await writeAudit(env, actor.id, 'system.random_mailbox_prefix.update', null, ip, { prefix })
  return json({ randomMailboxPrefix: prefix })
}
