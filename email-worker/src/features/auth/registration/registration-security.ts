import { sha256 } from '../session/auth'
import { allowedTurnstileHostnames } from '../../../app/middleware/origin-policy'
import type { Env } from '../../../app/types'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TEST_SITE_KEYS = new Set([
  '1x00000000000000000000AA',
  '2x00000000000000000000AB',
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
  '3x00000000000000000000FF',
])

interface TurnstileResponse {
  success?: boolean
  hostname?: string
  action?: string
  'error-codes'?: string[]
}

interface RatePolicy {
  scope: string
  value: string
  maximum: number
  windowSeconds: number
}

export type TurnstileResult = 'valid' | 'invalid' | 'unavailable'

export function registrationProtectionReady(env: Env): boolean {
  return Boolean(env.TURNSTILE_SITE_KEY?.trim() && env.TURNSTILE_SECRET_KEY?.trim())
}

export async function verifyRegistrationTurnstile(
  env: Env,
  token: string,
  ip: string,
  expectedAction: 'register' | 'temporary-invite' = 'register',
  requestOrigin?: string,
): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret || !token || token.length > 2048) return 'invalid'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const body: Record<string, string> = {
      secret,
      response: token,
      idempotency_key: crypto.randomUUID(),
    }
    if (ip && ip !== 'unknown') body.remoteip = ip
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) return 'unavailable'
    const result = await response.json<TurnstileResponse>()
    const testWidget = TEST_SITE_KEYS.has(env.TURNSTILE_SITE_KEY?.trim() || '')
    const actionValid = testWidget || result.action === expectedAction
    const hostnameValid = testWidget || Boolean(
      result.hostname && allowedTurnstileHostnames(
        env.APP_ORIGINS,
        requestOrigin,
      ).has(result.hostname.toLowerCase()),
    )
    if (!result.success || !actionValid || !hostnameValid) {
      console.warn('Turnstile registration rejected', {
        action: result.action || null,
        hostname: result.hostname || null,
        errorCodes: result['error-codes'] || [],
      })
      return 'invalid'
    }
    return 'valid'
  } catch {
    return 'unavailable'
  } finally {
    clearTimeout(timer)
  }
}

async function consumeBucket(
  db: D1Database,
  policy: RatePolicy,
  now: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const keyHash = await sha256(`registration:${policy.scope}\n${policy.value}`)
  const resetBefore = now - policy.windowSeconds
  const row = await db.prepare(
    `INSERT INTO registration_attempts (key_hash, attempts, window_started_at)
     VALUES (?, 1, ?)
     ON CONFLICT(key_hash) DO UPDATE SET
       attempts = CASE
         WHEN registration_attempts.window_started_at <= ? THEN 1
         ELSE registration_attempts.attempts + 1
       END,
       window_started_at = CASE
         WHEN registration_attempts.window_started_at <= ? THEN excluded.window_started_at
         ELSE registration_attempts.window_started_at
       END
     RETURNING attempts, window_started_at`,
  ).bind(keyHash, now, resetBefore, resetBefore)
    .first<{ attempts: number; window_started_at: number }>()
  const attempts = row?.attempts ?? policy.maximum + 1
  return {
    allowed: attempts <= policy.maximum,
    retryAfter: Math.max(1, (row?.window_started_at ?? now) + policy.windowSeconds - now),
  }
}

export async function consumeRegistrationRateLimit(
  db: D1Database,
  ip: string,
  email: string,
  now = Math.floor(Date.now() / 1000),
): Promise<{ allowed: boolean; retryAfter: number }> {
  const policies: RatePolicy[] = [
    { scope: 'ip-day', value: ip, maximum: 10, windowSeconds: 24 * 60 * 60 },
    { scope: 'ip-hour', value: ip, maximum: 3, windowSeconds: 60 * 60 },
    { scope: 'email-hour', value: email, maximum: 3, windowSeconds: 60 * 60 },
  ]
  for (const policy of policies) {
    const result = await consumeBucket(db, policy, now)
    if (!result.allowed) return result
  }
  return { allowed: true, retryAfter: 0 }
}

export async function consumeTemporaryInviteRateLimit(
  db: D1Database,
  ip: string,
  inviteId: string,
  now = Math.floor(Date.now() / 1000),
): Promise<{ allowed: boolean; retryAfter: number }> {
  const policies: RatePolicy[] = [
    { scope: 'invite-ip-hour', value: ip, maximum: 10, windowSeconds: 60 * 60 },
    { scope: 'invite-ip-day', value: ip, maximum: 30, windowSeconds: 24 * 60 * 60 },
    { scope: 'invite-token-hour', value: inviteId, maximum: 10, windowSeconds: 60 * 60 },
  ]
  for (const policy of policies) {
    const result = await consumeBucket(db, policy, now)
    if (!result.allowed) return result
  }
  return { allowed: true, retryAfter: 0 }
}
