import {
  createSessionToken,
  hashPassword,
  sha256,
  validatePassword,
} from '../auth/session/auth'
import { normalizeEmail, validEmail } from '../../shared/http/api-helpers'
import { pageResult, parsePageRequest } from '../../shared/http/pagination'
import {
  consumeTemporaryInviteRateLimit,
  registrationProtectionReady,
  verifyRegistrationTurnstile,
} from '../auth/registration/registration-security'
import { defaultQuotaBytes } from '../admin/settings/storage-policy'
import type { Env, SessionUser } from '../../app/types'

interface InviteRow {
  id: string
  domain_name: string
  domain_active: number
  account_role: 'user' | 'temporary'
  expires_at: number
  max_uses: number
  use_count: number
  address_mode: 'assigned' | 'self_selected'
  assigned_address: string | null
  account_lifetime_hours: number
  mailbox_limit: number
  can_create_mailboxes: number
  can_reply: number
  can_translate: number
  created_at: number
  revoked_at: number | null
}

interface InvitePolicyInput {
  domain?: unknown
  accountRole?: unknown
  expiresInHours?: unknown
  accountLifetimeHours?: unknown
  multiUse?: unknown
  addressMode?: unknown
  assignedLocalPart?: unknown
  mailboxLimit?: unknown
  canCreateMailboxes?: unknown
  canReply?: unknown
  canTranslate?: unknown
}

export type InviteState = 'active' | 'expired' | 'used' | 'revoked' | 'domain_disabled'

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers })
}

function isAdministrator(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin'
}

export function inviteState(row: Pick<
  InviteRow,
  'domain_active' | 'expires_at' | 'max_uses' | 'use_count' | 'revoked_at'
>, now: number): InviteState {
  if (row.revoked_at) return 'revoked'
  if (row.expires_at <= now) return 'expired'
  if (row.max_uses === 1 && row.use_count >= 1) return 'used'
  if (!row.domain_active) return 'domain_disabled'
  return 'active'
}

export function temporaryAddress(localPart: string, domain: string): string {
  const local = localPart.trim().toLowerCase()
  if (
    !local
    || local.length > 64
    || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/i.test(local)
    || local.startsWith('.')
    || local.endsWith('.')
    || local.includes('..')
  ) return ''
  const address = normalizeEmail(`${local}@${domain}`)
  return validEmail(address) ? address : ''
}

export function parseInviteAccountRole(value: unknown): 'user' | 'temporary' | null {
  if (value === undefined) return 'temporary'
  return value === 'user' || value === 'temporary' ? value : null
}

export function inviteAccountExpiresAt(
  role: 'user' | 'temporary',
  now: number,
  lifetimeHours: number,
): number | null {
  return role === 'temporary' ? now + lifetimeHours * 60 * 60 : null
}

function inviteJson(row: InviteRow, now: number) {
  return {
    id: row.id,
    domain: row.domain_name,
    accountRole: row.account_role,
    expiresAt: row.expires_at,
    multiUse: row.max_uses === 0,
    useCount: row.use_count,
    addressMode: row.address_mode,
    assignedAddress: row.assigned_address,
    accountLifetimeHours: row.account_role === 'temporary'
      ? row.account_lifetime_hours
      : null,
    mailboxLimit: row.mailbox_limit,
    canCreateMailboxes: Boolean(row.can_create_mailboxes),
    canReply: Boolean(row.can_reply),
    canTranslate: Boolean(row.can_translate),
    createdAt: row.created_at,
    state: inviteState(row, now),
  }
}

const INVITE_SELECT = `
  SELECT i.id, i.domain_name, i.account_role, i.expires_at, i.max_uses, i.use_count,
         i.address_mode, i.assigned_address,
         i.account_lifetime_hours,
         i.mailbox_limit, i.can_create_mailboxes, i.can_reply, i.can_translate,
         i.created_at, i.revoked_at, COALESCE(d.is_active, 0) AS domain_active
    FROM temporary_invites i
    LEFT JOIN domains d ON d.name = i.domain_name`

async function inviteByToken(env: Env, token: string): Promise<InviteRow | null> {
  if (!token || token.length > 160) return null
  return env.DB.prepare(
    `${INVITE_SELECT} WHERE i.token_hash = ?`,
  ).bind(await sha256(token)).first<InviteRow>()
}

async function audit(
  env: Env,
  userId: string | null,
  action: string,
  targetId: string,
  ip: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (user_id, action, target_id, ip, detail_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(userId, action, targetId, ip, JSON.stringify(detail)).run()
}

export async function listTemporaryInvites(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  if (!isAdministrator(user)) return json({ error: '只有管理员可以查看邀请。' }, 403)
  const pagination = parsePageRequest(request, 2, 30)
  if (!pagination) return json({ error: '分页参数无效，limit 需要在 1–100 之间。' }, 400)
  const bindings: Array<string | number> = []
  let cursorWhere = ''
  if (pagination.cursor) {
    const [createdAt, id] = pagination.cursor.values
    if (
      typeof createdAt !== 'number'
      || !Number.isSafeInteger(createdAt)
      || createdAt < 0
      || typeof id !== 'string'
      || !id
      || id.length > 100
    ) return json({ error: '邀请分页游标无效。' }, 400)
    cursorWhere = `WHERE (
      i.created_at < ? OR (i.created_at = ? AND i.id < ?)
    )`
    bindings.push(createdAt, createdAt, id)
  }
  const { results } = await env.DB.prepare(
    `${INVITE_SELECT} ${cursorWhere}
     ORDER BY i.created_at DESC, i.id DESC LIMIT ?`,
  ).bind(...bindings, pagination.limit + 1).all<InviteRow>()
  const now = Math.floor(Date.now() / 1000)
  const result = pageResult(
    results,
    pagination.limit,
    (row) => [row.created_at, row.id],
  )
  return json({
    invites: result.items.map((row) => inviteJson(row, now)),
    page: result.page,
  })
}

export async function createTemporaryInvite(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(user)) return json({ error: '只有管理员可以创建邀请。' }, 403)
  const body = await request.json<InvitePolicyInput>()
    .catch(() => ({} as InvitePolicyInput))
  const domain = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : ''
  const accountRole = parseInviteAccountRole(body.accountRole)
  const expiresInHours = Number(body.expiresInHours)
  const accountLifetimeHours = accountRole === 'temporary'
    ? Number(body.accountLifetimeHours)
    : 24
  const mailboxLimit = Number(body.mailboxLimit)
  const addressMode = body.addressMode
  if (
    !domain
    || !accountRole
    || !Number.isInteger(expiresInHours)
    || expiresInHours < 1
    || expiresInHours > 720
    || !Number.isInteger(accountLifetimeHours)
    || accountLifetimeHours < 1
    || accountLifetimeHours > 720
    || typeof body.multiUse !== 'boolean'
    || (addressMode !== 'assigned' && addressMode !== 'self_selected')
    || (addressMode === 'assigned' && body.multiUse)
    || !Number.isInteger(mailboxLimit)
    || mailboxLimit < 1
    || mailboxLimit > 100
    || typeof body.canCreateMailboxes !== 'boolean'
    || typeof body.canReply !== 'boolean'
    || typeof body.canTranslate !== 'boolean'
  ) {
    return json({ error: '邀请配置无效。' }, 400)
  }
  if (body.multiUse && !registrationProtectionReady(env)) {
    return json({ error: '请先配置 Turnstile，再创建多人注册链接。' }, 409)
  }
  const allowedDomain = await env.DB.prepare(
    'SELECT name FROM domains WHERE name = ? AND is_active = 1',
  ).bind(domain).first<{ name: string }>()
  if (!allowedDomain) return json({ error: '请选择已启用的域名。' }, 400)

  const assignedAddress = addressMode === 'assigned'
    ? temporaryAddress(
      typeof body.assignedLocalPart === 'string' ? body.assignedLocalPart : '',
      domain,
    )
    : null
  if (addressMode === 'assigned' && !assignedAddress) {
    return json({ error: '请输入有效的指定邮箱前缀。' }, 400)
  }
  if (assignedAddress) {
    const unavailable = await env.DB.prepare(
      `SELECT 1 AS unavailable FROM mailboxes WHERE address = ?
       UNION ALL
       SELECT 1 AS unavailable FROM users WHERE email = ?
       UNION ALL
       SELECT 1 AS unavailable FROM temporary_invites
        WHERE assigned_address = ? AND revoked_at IS NULL
          AND expires_at > unixepoch() AND use_count = 0
       LIMIT 1`,
    ).bind(assignedAddress, assignedAddress, assignedAddress).first<{ unavailable: number }>()
    if (unavailable) return json({ error: '这个邮箱地址已经被使用或预留。' }, 409)
  }

  const id = crypto.randomUUID()
  const token = createSessionToken()
  const now = Math.floor(Date.now() / 1000)
  const canCreateMailboxes = addressMode === 'assigned' ? false : body.canCreateMailboxes
  const effectiveLimit = canCreateMailboxes ? mailboxLimit : 1
  await env.DB.prepare(
    `INSERT INTO temporary_invites (
      id, token_hash, domain_name, account_role, expires_at, max_uses, address_mode,
      assigned_address, account_lifetime_hours, mailbox_limit,
      can_create_mailboxes, can_reply, can_translate, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    await sha256(token),
    domain,
    accountRole,
    now + expiresInHours * 60 * 60,
    body.multiUse ? 0 : 1,
    addressMode,
    assignedAddress,
    accountLifetimeHours,
    effectiveLimit,
    Number(canCreateMailboxes),
    Number(body.canReply),
    Number(body.canTranslate),
    user.id,
  ).run()
  await audit(env, user.id, 'temporary_invite.create', id, ip, {
    domain,
    accountRole,
    addressMode,
    assignedAddress,
    accountLifetimeHours,
    multiUse: body.multiUse,
    canCreateMailboxes,
    canReply: body.canReply,
    canTranslate: body.canTranslate,
  })
  const created = await env.DB.prepare(
    `${INVITE_SELECT} WHERE i.id = ?`,
  ).bind(id).first<InviteRow>()
  return json({ invite: created && inviteJson(created, now), token }, 201)
}

export async function revokeTemporaryInvite(
  env: Env,
  user: SessionUser,
  id: string,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(user)) return json({ error: '只有管理员可以撤销邀请。' }, 403)
  const result = await env.DB.prepare(
    `UPDATE temporary_invites
        SET revoked_at = COALESCE(revoked_at, unixepoch())
      WHERE id = ?`,
  ).bind(id).run()
  if (!result.meta.changes) return json({ error: '邀请不存在。' }, 404)
  await audit(env, user.id, 'temporary_invite.revoke', id, ip)
  return json({ ok: true })
}

function unavailableMessage(state: InviteState): string {
  const messages: Record<Exclude<InviteState, 'active'>, string> = {
    expired: '邀请链接已经过期。',
    used: '这个单次邀请链接已经使用。',
    revoked: '邀请链接已经被管理员撤销。',
    domain_disabled: '管理员已经停用此邀请使用的域名。',
  }
  return state === 'active' ? '' : messages[state]
}

export async function temporaryInvitePreview(env: Env, token: string): Promise<Response> {
  const invite = await inviteByToken(env, token)
  if (!invite) return json({ error: '邀请链接不存在。' }, 404)
  const now = Math.floor(Date.now() / 1000)
  const state = inviteState(invite, now)
  if (state !== 'active') return json({ error: unavailableMessage(state) }, 410)
  return json({ invite: inviteJson(invite, now) })
}

export async function registerTemporaryInvite(
  env: Env,
  token: string,
  request: Request,
  ip: string,
): Promise<Response> {
  const invite = await inviteByToken(env, token)
  if (!invite) return json({ error: '邀请链接不存在。' }, 404)
  const now = Math.floor(Date.now() / 1000)
  const state = inviteState(invite, now)
  if (state !== 'active') return json({ error: unavailableMessage(state) }, 410)

  const body = await request.json<{
    displayName?: string
    localPart?: string
    password?: string
    turnstileToken?: string
  }>().catch(() => ({} as {
    displayName?: string
    localPart?: string
    password?: string
    turnstileToken?: string
  }))
  const displayName = (body.displayName || '').trim()
  const address = invite.address_mode === 'assigned'
    ? invite.assigned_address || ''
    : temporaryAddress(body.localPart || '', invite.domain_name)
  const password = body.password || ''
  if (!displayName || displayName.length > 60) {
    return json({ error: '显示名称需要在 1–60 个字符之间。' }, 400)
  }
  if (!address) {
    return json({
      error: invite.address_mode === 'assigned'
        ? '管理员指定的邮箱地址无效，请申请新链接。'
        : '请输入有效的邮箱前缀。',
    }, 400)
  }
  const passwordError = validatePassword(password)
  if (passwordError) return json({ error: passwordError }, 400)

  if (invite.max_uses === 1) {
    const rate = await consumeTemporaryInviteRateLimit(env.DB, ip, invite.id, now)
    if (!rate.allowed) {
      await audit(env, null, 'temporary_invite.register_failed', invite.id, ip, {
        reason: 'rate_limited',
      })
      return json(
        { error: '邀请注册尝试过多，请稍后再试。' },
        429,
        { 'Retry-After': String(rate.retryAfter) },
      )
    }
  } else {
    if (!registrationProtectionReady(env)) {
      return json({ error: '邀请安全验证尚未配置，请联系管理员。' }, 503)
    }
    const turnstile = await verifyRegistrationTurnstile(
      env,
      body.turnstileToken || '',
      ip,
      'temporary-invite',
      request.headers.get('Origin') || new URL(request.url).origin,
    )
    if (turnstile !== 'valid') {
      await audit(env, null, 'temporary_invite.register_failed', invite.id, ip, {
        reason: turnstile === 'unavailable' ? 'turnstile_unavailable' : 'turnstile_invalid',
      })
      return json(
        { error: turnstile === 'unavailable' ? '人机验证服务暂时不可用，请重试。' : '人机验证未通过，请重试。' },
        turnstile === 'unavailable' ? 503 : 400,
      )
    }
  }

  const occupied = await env.DB.prepare(
    `SELECT 1 AS occupied FROM users WHERE email = ?
     UNION ALL
     SELECT 1 AS occupied FROM mailboxes WHERE address = ?
     LIMIT 1`,
  ).bind(address, address).first<{ occupied: number }>()
  if (occupied) return json({ error: '这个邮箱地址已经被使用。' }, 409)

  const passwordHash = await hashPassword(password)
  const claimed = await env.DB.prepare(
    `UPDATE temporary_invites
        SET use_count = use_count + 1
      WHERE id = ?
        AND revoked_at IS NULL
        AND expires_at > ?
        AND (max_uses = 0 OR use_count < max_uses)
        AND EXISTS (
          SELECT 1 FROM domains
           WHERE name = temporary_invites.domain_name AND is_active = 1
        )`,
  ).bind(invite.id, now).run()
  if (!claimed.meta.changes) {
    return json({ error: '邀请链接刚刚失效，请向管理员申请新链接。' }, 410)
  }

  const userId = crypto.randomUUID()
  const accountRole = invite.account_role
  const accountExpiresAt = inviteAccountExpiresAt(
    accountRole,
    now,
    invite.account_lifetime_hours,
  )
  const storageQuotaBytes = await defaultQuotaBytes(env.DB, accountRole)
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (
          id, email, display_name, password_hash, role, status, mailbox_limit,
          storage_quota_bytes, can_create_mailboxes, can_reply, can_translate,
          temporary_expires_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
      ).bind(
        userId,
        address,
        displayName,
        passwordHash,
        accountRole,
        invite.mailbox_limit,
        storageQuotaBytes,
        invite.can_create_mailboxes,
        invite.can_reply,
        invite.can_translate,
        accountExpiresAt,
      ),
      env.DB.prepare(
        `INSERT INTO mailboxes (address, user_id, is_primary, is_active)
         VALUES (?, ?, 1, 1)`,
      ).bind(address, userId),
    ])
  } catch {
    await env.DB.prepare(
      'UPDATE temporary_invites SET use_count = MAX(0, use_count - 1) WHERE id = ?',
    ).bind(invite.id).run()
    return json({ error: '这个邮箱地址刚刚被使用，请换一个前缀。' }, 409)
  }

  await audit(env, userId, 'temporary_invite.register', invite.id, ip, {
    address,
    accountRole,
    temporaryExpiresAt: accountExpiresAt,
  })
  return json({ email: address }, 201)
}
