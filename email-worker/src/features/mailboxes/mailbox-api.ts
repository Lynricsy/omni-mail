import { normalizeEmail, validEmail } from '../../shared/http/api-helpers'
import type { Env, SessionUser } from '../../app/types'

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

  if (existing) {
    await env.DB.prepare(
      'UPDATE mailboxes SET is_active = 1, is_primary = ? WHERE address = ? AND user_id = ?',
    ).bind(existing.is_primary, address, user.id).run()
  } else {
    const inserted = await env.DB.prepare(
      `INSERT OR IGNORE INTO mailboxes (address, user_id, is_primary, is_active)
       SELECT ?, ?, CASE WHEN EXISTS (
         SELECT 1 FROM mailboxes WHERE user_id = ? AND is_hidden = 0
       ) THEN 0 ELSE 1 END, 1
       WHERE ? = 'super_admin' OR (
         SELECT COUNT(*) FROM mailboxes WHERE user_id = ? AND is_hidden = 0
       ) < ?`,
    ).bind(address, user.id, user.id, user.role, user.id, user.mailboxLimit).run()
    if (!inserted.meta.changes) {
      const conflict = await env.DB.prepare(
        'SELECT 1 AS found FROM mailboxes WHERE address = ?',
      ).bind(address).first<{ found: number }>()
      if (conflict) return json({ error: '这个邮箱地址刚刚被其他请求占用。' }, 409)
      return json({ error: `最多可以创建 ${user.mailboxLimit} 个邮箱。` }, 403)
    }
  }
  const saved = await env.DB.prepare(
    `SELECT address, is_primary, is_active FROM mailboxes
      WHERE address = ? AND user_id = ?`,
  ).bind(address, user.id).first<MailboxRow>()
  if (!saved) return json({ error: '邮箱创建失败，请稍后重试。' }, 409)
  await auditMailbox(env, user.id, existing ? 'mailbox.enable' : 'mailbox.create', address, ip)
  return json({
    mailbox: mailboxJson(saved),
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
  const body = await request.json<{ isActive?: boolean; isPrimary?: boolean }>()
    .catch(() => ({} as { isActive?: boolean; isPrimary?: boolean }))
  const changesStatus = typeof body.isActive === 'boolean'
  const makesPrimary = body.isPrimary === true
  if (changesStatus === makesPrimary) return json({ error: '邮箱更新内容无效。' }, 400)

  const mailbox = await env.DB.prepare(
    `SELECT address, is_primary, is_active
       FROM mailboxes WHERE address = ? AND user_id = ? AND is_hidden = 0`,
  ).bind(address, user.id).first<MailboxRow>()
  if (!mailbox) return json({ error: '邮箱地址不存在。' }, 404)
  if (makesPrimary) {
    if (!mailbox.is_active) {
      return json({ error: '只能将已启用的邮箱设为主邮箱。' }, 409)
    }
    if (!mailbox.is_primary) {
      const domain = await env.DB.prepare(
        'SELECT is_active FROM domains WHERE name = ?',
      ).bind(mailboxDomain(address)).first<{ is_active: number }>()
      if (!domain?.is_active) {
        return json({ error: '这个域名尚未在系统设置中启用。' }, 403)
      }
      const updated = await env.DB.prepare(
        `UPDATE mailboxes
            SET is_primary = CASE WHEN address = ? THEN 1 ELSE 0 END
          WHERE user_id = ? AND is_hidden = 0
            AND EXISTS (
              SELECT 1 FROM mailboxes target
               WHERE target.address = ? AND target.user_id = ?
                 AND target.is_active = 1 AND target.is_hidden = 0
            )`,
      ).bind(address, user.id, address, user.id).run()
      if (!updated.meta.changes) return json({ error: '邮箱地址不存在。' }, 404)
      await auditMailbox(env, user.id, 'mailbox.set_primary', address, ip)
    }
    return json({ mailbox: mailboxJson({ ...mailbox, is_primary: 1 }) })
  }
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

export async function deleteMailbox(
  env: Env,
  user: SessionUser,
  encodedAddress: string,
  ip: string,
): Promise<Response> {
  if (!canCreateMailbox(user)) return json({ error: '当前账户没有管理邮箱的权限。' }, 403)
  if (!env.CLEANUP_WORKFLOW) {
    return json({ error: '邮箱删除服务暂时不可用，请稍后重试。' }, 503)
  }
  let address = ''
  try {
    address = normalizeEmail(decodeURIComponent(encodedAddress))
  } catch {
    return json({ error: '邮箱地址格式无效。' }, 400)
  }
  const mailbox = await env.DB.prepare(
    `SELECT address, is_primary, is_active
       FROM mailboxes WHERE address = ? AND user_id = ? AND is_hidden = 0`,
  ).bind(address, user.id).first<MailboxRow>()
  if (!mailbox) return json({ error: '邮箱地址不存在。' }, 404)
  if (mailbox.is_primary) return json({ error: '主邮箱不能删除。' }, 409)

  const hidden = await env.DB.prepare(
    `UPDATE mailboxes SET is_active = 0, is_hidden = 1
      WHERE address = ? AND user_id = ? AND is_primary = 0`,
  ).bind(address, user.id).run()
  if (!hidden.meta.changes) return json({ error: '邮箱地址不存在。' }, 404)
  try {
    await env.CLEANUP_WORKFLOW.create({
      id: `mailbox-delete-${crypto.randomUUID()}`,
      params: {
        startedAt: Math.floor(Date.now() / 1000),
        mailboxDeletion: { address: mailbox.address, userId: user.id, requestedBy: user.id },
      },
      retention: { successRetention: '3 days', errorRetention: '7 days' },
    })
  } catch {
    await env.DB.prepare(
      `UPDATE mailboxes SET is_active = ?, is_hidden = 0
        WHERE address = ? AND user_id = ? AND is_primary = 0`,
    ).bind(mailbox.is_active, address, user.id).run()
    return json({ error: '邮箱删除任务启动失败，请稍后重试。' }, 503)
  }
  await auditMailbox(env, user.id, 'mailbox.delete_scheduled', address, ip)
  return json({ ok: true }, 202)
}
