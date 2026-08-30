import {
  createSessionToken,
  hashPassword,
  storeSession,
  validatePassword,
} from '../session/auth'
import { normalizeEmail, validEmail } from '../../../shared/http/api-helpers'
import { writeAudit } from '../../../shared/audit/audit'
import {
  consumeRegistrationRateLimit,
  registrationProtectionReady,
  verifyRegistrationTurnstile,
} from './registration-security'
import { defaultQuotaBytes } from '../../admin/settings/storage-policy'
import type { Env, SessionUser } from '../../../app/types'

const REGISTRATION_SETTING = 'external_registration_enabled'
const REGISTRATION_METHOD_SETTING = 'external_registration_method'
const DOMAIN_POLICY_MODE_SETTING = 'registration_domain_policy_mode'
const DOMAIN_POLICY_DOMAINS_SETTING = 'registration_blocked_domains'
const MAX_BLOCKED_DOMAINS = 100

export type RegistrationDomainPolicyMode = 'blocklist' | 'allowlist'
export type RegistrationMethod = 'password' | 'linuxdo'

export interface RegistrationDomainPolicy {
  mode: RegistrationDomainPolicyMode
  domains: string[]
}

interface RegistrationInput {
  email?: string
  displayName?: string
  password?: string
  turnstileToken?: string
}

type ParsedRegistration =
  | { value: { email: string; displayName: string; password: string; turnstileToken: string } }
  | { error: string }

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers })
}

function isAdministrator(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin'
}

export function parseRegistrationInput(input: RegistrationInput): ParsedRegistration {
  const email = normalizeEmail(input.email || '')
  const displayName = (input.displayName || '').trim()
  const password = input.password || ''
  const turnstileToken = input.turnstileToken || ''
  if (!validEmail(email)) return { error: '请输入有效的登录邮箱。' }
  if (!displayName || displayName.length > 60) {
    return { error: '显示名称需要在 1–60 个字符之间。' }
  }
  const passwordError = validatePassword(password)
  if (passwordError) return { error: passwordError }
  if (!turnstileToken || turnstileToken.length > 2048) {
    return { error: '请先完成人机验证。' }
  }
  return { value: { email, displayName, password, turnstileToken } }
}

export async function externalRegistrationEnabled(db: D1Database): Promise<boolean> {
  const setting = await db.prepare(
    'SELECT value FROM settings WHERE key = ?',
  ).bind(REGISTRATION_SETTING).first<{ value: string }>()
  return setting?.value === '1'
}

export function linuxDoAuthReady(env: Env): boolean {
  return Boolean(
    env.LINUX_DO_CLIENT_ID?.trim()
    && env.LINUX_DO_CLIENT_SECRET?.trim(),
  )
}

export function parseRegistrationMethod(value: unknown): RegistrationMethod | null {
  return value === 'password' || value === 'linuxdo' ? value : null
}

export async function externalRegistrationMethod(db: D1Database): Promise<RegistrationMethod> {
  const setting = await db.prepare(
    'SELECT value FROM settings WHERE key = ?',
  ).bind(REGISTRATION_METHOD_SETTING).first<{ value: string }>()
  return parseRegistrationMethod(setting?.value) || 'password'
}

function validDomainSuffix(value: string): boolean {
  if (value.length > 253) return false
  const labels = value.split('.')
  return labels.length >= 2 && labels.every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ))
}

export function parseRegistrationDomains(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length > MAX_BLOCKED_DOMAINS) return null
  const domains: string[] = []
  for (const item of input) {
    if (typeof item !== 'string') return null
    const domain = item.trim().toLowerCase().replace(/^@/, '')
    if (!validDomainSuffix(domain)) return null
    if (!domains.includes(domain)) domains.push(domain)
  }
  return domains.sort()
}

export function parseRegistrationDomainPolicy(input: {
  mode?: unknown
  domains?: unknown
}): RegistrationDomainPolicy | null {
  const mode = input.mode
  const domains = parseRegistrationDomains(input.domains)
  if (
    (mode !== 'blocklist' && mode !== 'allowlist')
    || !domains
    || (mode === 'allowlist' && domains.length === 0)
  ) return null
  return { mode, domains }
}

export function emailMatchesDomainList(email: string, domains: string[]): boolean {
  const domain = normalizeEmail(email).split('@').at(-1) || ''
  return domains.some((listed) => (
    domain === listed || domain.endsWith(`.${listed}`)
  ))
}

export function emailAllowedByDomainPolicy(
  email: string,
  policy: RegistrationDomainPolicy,
): boolean {
  const matches = emailMatchesDomainList(email, policy.domains)
  return policy.mode === 'allowlist' ? matches : !matches
}

export async function registrationDomainPolicy(
  db: D1Database,
): Promise<RegistrationDomainPolicy> {
  const [modeSetting, domainsSetting] = await Promise.all([
    db.prepare('SELECT value FROM settings WHERE key = ?')
      .bind(DOMAIN_POLICY_MODE_SETTING).first<{ value: string }>(),
    db.prepare(
    'SELECT value FROM settings WHERE key = ?',
    ).bind(DOMAIN_POLICY_DOMAINS_SETTING).first<{ value: string }>(),
  ])
  const mode = modeSetting?.value === 'allowlist' ? 'allowlist' : 'blocklist'
  if (!domainsSetting) return { mode, domains: [] }
  try {
    const domains = parseRegistrationDomains(JSON.parse(domainsSetting.value)) ?? []
    return { mode, domains }
  } catch {
    return { mode, domains: [] }
  }
}

export async function registerExternalUser(
  env: Env,
  request: Request,
  ip: string,
): Promise<{ response: Response; sessionToken?: string }> {
  if (!await externalRegistrationEnabled(env.DB)) {
    return { response: json({ error: '管理员当前未开放外部注册。' }, 403) }
  }
  if (await externalRegistrationMethod(env.DB) !== 'password') {
    return { response: json({ error: '当前仅允许通过 Linux DO 注册。' }, 403) }
  }
  if (!registrationProtectionReady(env)) {
    return { response: json({ error: '注册保护尚未配置，请联系管理员。' }, 503) }
  }
  const body = await request.json<RegistrationInput>().catch(() => ({}))
  const parsed = parseRegistrationInput(body)
  if ('error' in parsed) return { response: json({ error: parsed.error }, 400) }
  const { email, displayName, password, turnstileToken } = parsed.value
  if (email === normalizeEmail(env.SUPER_ADMIN_EMAIL || '')) {
    return { response: json({ error: '该邮箱不能用于外部注册。' }, 409) }
  }
  const domainPolicy = await registrationDomainPolicy(env.DB)
  if (!emailAllowedByDomainPolicy(email, domainPolicy)) {
    await writeAudit(env, null, 'auth.register_failed', email, ip, {
      reason: domainPolicy.mode === 'allowlist'
        ? 'email_domain_not_allowed'
        : 'blocked_email_domain',
    })
    const error = domainPolicy.mode === 'allowlist'
      ? '该邮箱后缀不在管理员允许的注册范围内。'
      : '管理员不允许使用该邮箱后缀注册。'
    return { response: json({ error }, 403) }
  }

  const rate = await consumeRegistrationRateLimit(env.DB, ip, email)
  if (!rate.allowed) {
    await writeAudit(env, null, 'auth.register_failed', email, ip, {
      reason: 'rate_limited',
    })
    return {
      response: json(
        { error: '注册请求过多，请稍后再试。' },
        429,
        { 'Retry-After': String(rate.retryAfter) },
      ),
    }
  }

  const turnstile = await verifyRegistrationTurnstile(
    env,
    turnstileToken,
    ip,
    'register',
    request.headers.get('Origin') || new URL(request.url).origin,
  )
  if (turnstile !== 'valid') {
    await writeAudit(env, null, 'auth.register_failed', email, ip, {
      reason: turnstile === 'unavailable' ? 'turnstile_unavailable' : 'turnstile_invalid',
    })
    return {
      response: json(
        { error: turnstile === 'unavailable' ? '人机验证服务暂时不可用，请重试。' : '人机验证未通过，请重试。' },
        turnstile === 'unavailable' ? 503 : 400,
      ),
    }
  }

  const id = crypto.randomUUID()
  const storageQuotaBytes = await defaultQuotaBytes(env.DB, 'user')
  try {
    await env.DB.prepare(
      `INSERT INTO users (
        id, email, display_name, password_hash, role, status, mailbox_limit,
        storage_quota_bytes, can_create_mailboxes, can_reply
      ) VALUES (?, ?, ?, ?, 'user', 'active', 1, ?, 1, 0)`,
    ).bind(id, email, displayName, await hashPassword(password), storageQuotaBytes).run()
  } catch {
    await writeAudit(env, null, 'auth.register_failed', email, ip, {
      reason: 'email_conflict',
    })
    return { response: json({ error: '该登录邮箱已经注册。' }, 409) }
  }

  const sessionToken = createSessionToken()
  await storeSession(env.DB, id, sessionToken)
  await writeAudit(env, id, 'auth.register', id, ip, {
    channel: 'public',
    role: 'user',
  })
  return {
    sessionToken,
    response: json({
      user: {
        id,
        email,
        displayName,
        role: 'user',
        mailboxLimit: 1,
        storageQuotaBytes,
        storageUsedBytes: 0,
        canCreateMailboxes: true,
        canReply: false,
        canTranslate: true,
        temporaryExpiresAt: null,
      },
    }, 201),
  }
}

export async function updateExternalRegistration(
  env: Env,
  actor: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) {
    return json({ error: '只有管理员可以修改注册设置。' }, 403)
  }
  const body = await request.json<{ enabled?: boolean; method?: unknown }>()
    .catch(() => ({} as { enabled?: boolean; method?: unknown }))
  const method = parseRegistrationMethod(body.method)
  if (typeof body.enabled !== 'boolean' || !method) {
    return json({ error: '注册设置无效。' }, 400)
  }
  if (body.enabled && method === 'password' && !registrationProtectionReady(env)) {
    return json({
      error: '请先配置 TURNSTILE_SITE_KEY 和 TURNSTILE_SECRET_KEY。',
    }, 409)
  }
  if (body.enabled && method === 'linuxdo' && !linuxDoAuthReady(env)) {
    return json({ error: '请先配置 Linux DO Connect Client ID 和 Client Secret。' }, 409)
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind(REGISTRATION_SETTING, body.enabled ? '1' : '0'),
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind(REGISTRATION_METHOD_SETTING, method),
  ])
  await writeAudit(env, actor.id, 'system.registration.update', null, ip, {
    enabled: body.enabled,
    method,
  })
  return json({ registrationEnabled: body.enabled, registrationMethod: method })
}

export async function updateRegistrationDomainPolicy(
  env: Env,
  actor: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) {
    return json({ error: '只有管理员可以修改注册邮箱限制。' }, 403)
  }
  const body = await request.json<{ mode?: unknown; domains?: unknown }>()
    .catch(() => ({} as { mode?: unknown; domains?: unknown }))
  const policy = parseRegistrationDomainPolicy(body)
  if (!policy) return json({
    error: '规则无效；允许列表至少需要一个后缀，最多可以设置 100 个完整域名。',
  }, 400)
  const { mode, domains } = policy
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind(DOMAIN_POLICY_MODE_SETTING, mode),
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
    ).bind(DOMAIN_POLICY_DOMAINS_SETTING, JSON.stringify(domains)),
  ])
  await writeAudit(env, actor.id, 'system.registration_domains.update', null, ip, {
    mode,
    count: domains.length,
  })
  return json({ registrationDomainPolicy: { mode, domains } })
}
