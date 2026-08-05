import { normalizeEmail, validEmail } from './api-helpers'
import type { Env, SessionUser } from './types'

interface MailboxRow {
  address: string
  is_primary: number
  is_active: number
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

export function canCreateMailbox(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin' || user.canCreateMailboxes
}

export function mailboxDomain(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1).toLowerCase()
}

function mailboxJson(row: MailboxRow) {
  return {
    address: row.address,
    domain: mailboxDomain(row.address),
    isPrimary: Boolean(row.is_primary),
    isActive: Boolean(row.is_active),
  }
}

async function auditMailbox(
  env: Env,
  userId: string,
  action: string,
  address: string,
  ip: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (user_id, action, target_id, ip, detail_json)
     VALUES (?, ?, ?, ?, '{}')`,
  ).bind(userId, action, address, ip).run()
}

export async function listMailboxes(env: Env, user: SessionUser): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT address, is_primary, is_active
       FROM mailboxes
      WHERE user_id = ? AND is_hidden = 0
      ORDER BY is_active DESC, is_primary DESC, address`,
  ).bind(user.id).all<MailboxRow>()
  return json({ mailboxes: results.map(mailboxJson) })
}

export async function addMailbox(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!canCreateMailbox(user)) return json({ error: '当前账户没有创建邮箱的权限。' }, 403)
  const body = await request.json<{ address?: string }>()
    .catch(() => ({} as { address?: string }))
  const address = normalizeEmail(body.address || '')
  if (!validEmail(address)) return json({ error: '请输入有效的完整邮箱地址。' }, 400)
  const existing = await env.DB.prepare(
    'SELECT address, user_id, is_primary, is_active FROM mailboxes WHERE address = ?',
  ).bind(address).first<MailboxRow & { user_id: string }>()
  if (existing?.user_id && existing.user_id !== user.id) {
    return json({ error: '这个邮箱地址已属于其他账户。' }, 409)
  }
  if (existing?.is_active) return json({ error: '这个邮箱地址已经启用。' }, 409)

  const domain = await env.DB.prepare(
    'SELECT is_active FROM domains WHERE name = ?',
  ).bind(mailboxDomain(address)).first<{ is_active: number }>()
  if (!domain?.is_active) {
    return json({ error: '这个域名尚未在系统设置中启用。' }, 403)
  }

  if (!existing) {
    const reservation = await env.DB.prepare(
      `SELECT 1 AS reserved FROM temporary_invites
        WHERE assigned_address = ? AND address_mode = 'assigned'
          AND revoked_at IS NULL AND expires_at > unixepoch() AND use_count = 0
        LIMIT 1`,
    ).bind(address).first<{ reserved: number }>()
    if (reservation) {
      return json({ error: '这个邮箱地址已由用户邀请预留。' }, 409)
    }
  }

  const mailboxCount = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM mailboxes WHERE user_id = ? AND is_hidden = 0',
  ).bind(user.id).first<{ count: number }>()
  const isPrimary = existing?.is_primary || Number((mailboxCount?.count ?? 0) === 0)
  if (!existing && user.role !== 'super_admin' && (mailboxCount?.count ?? 0) >= user.mailboxLimit) {
    return json({ error: `最多可以创建 ${user.mailboxLimit} 个邮箱。` }, 403)
  }

  if (existing) {
    await env.DB.prepare(
      'UPDATE mailboxes SET is_active = 1, is_primary = ? WHERE address = ? AND user_id = ?',
    ).bind(isPrimary, address, user.id).run()
  } else {
    await env.DB.prepare(
      'INSERT INTO mailboxes (address, user_id, is_primary, is_active) VALUES (?, ?, ?, 1)',
    ).bind(address, user.id, isPrimary).run()
  }
  await auditMailbox(env, user.id, existing ? 'mailbox.enable' : 'mailbox.create', address, ip)
  return json({
    mailbox: mailboxJson({ address, is_primary: isPrimary, is_active: 1 }),
  }, existing ? 200 : 201)
}

export async function updateMailbox(
  env: Env,
  user: SessionUser,
  encodedAddress: string,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!canCreateMailbox(user)) return json({ error: '当前账户没有管理邮箱的权限。' }, 403)
  let address = ''
  try {
    address = normalizeEmail(decodeURIComponent(encodedAddress))
  } catch {
    return json({ error: '邮箱地址格式无效。' }, 400)
  }
  const body = await request.json<{ isActive?: boolean }>()
    .catch(() => ({} as { isActive?: boolean }))
  if (typeof body.isActive !== 'boolean') return json({ error: '缺少邮箱状态。' }, 400)

  const mailbox = await env.DB.prepare(
    `SELECT address, is_primary, is_active
       FROM mailboxes WHERE address = ? AND user_id = ?`,
  ).bind(address, user.id).first<MailboxRow>()
  if (!mailbox) return json({ error: '邮箱地址不存在。' }, 404)
  if (mailbox.is_primary && !body.isActive) {
    return json({ error: '主邮箱不能停用。' }, 409)
  }
  if (body.isActive) {
    const domain = await env.DB.prepare(
      'SELECT is_active FROM domains WHERE name = ?',
    ).bind(mailboxDomain(address)).first<{ is_active: number }>()
    if (!domain?.is_active) {
      return json({ error: '这个域名尚未在系统设置中启用。' }, 403)
    }
  }

  await env.DB.prepare(
    'UPDATE mailboxes SET is_active = ? WHERE address = ? AND user_id = ?',
  ).bind(Number(body.isActive), address, user.id).run()
  await auditMailbox(
    env,
    user.id,
    body.isActive ? 'mailbox.enable' : 'mailbox.disable',
    address,
    ip,
  )
  return json({
    mailbox: mailboxJson({ ...mailbox, is_active: Number(body.isActive) }),
  })
}
