import { sha256 } from '../session/auth'

const SETUP_TOKEN_MIN_BYTES = 32
const SETUP_WINDOW_SECONDS = 15 * 60
const MAX_SETUP_ATTEMPTS_PER_IP = 5
const MAX_SETUP_ATTEMPTS_GLOBAL = 50

interface RatePolicy {
  scope: string
  maximum: number
}

export function validSetupTokenSecret(value: string | undefined): value is string {
  return typeof value === 'string'
    && new TextEncoder().encode(value).byteLength >= SETUP_TOKEN_MIN_BYTES
}

async function consumeBucket(
  db: D1Database,
  policy: RatePolicy,
  now: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const keyHash = await sha256(`setup:${policy.scope}`)
  const resetBefore = now - SETUP_WINDOW_SECONDS
  const row = await db.prepare(
    `INSERT INTO login_attempts (key_hash, attempts, window_started_at)
     VALUES (?, 1, ?)
     ON CONFLICT(key_hash) DO UPDATE SET
       attempts = CASE
         WHEN login_attempts.window_started_at <= ? THEN 1
         ELSE login_attempts.attempts + 1
       END,
       window_started_at = CASE
         WHEN login_attempts.window_started_at <= ? THEN excluded.window_started_at
         ELSE login_attempts.window_started_at
       END
     RETURNING attempts, window_started_at`,
  ).bind(keyHash, now, resetBefore, resetBefore)
    .first<{ attempts: number; window_started_at: number }>()
  return {
    allowed: Boolean(row && row.attempts <= policy.maximum),
    retryAfter: Math.max(1, (row?.window_started_at ?? now) + SETUP_WINDOW_SECONDS - now),
  }
}

export async function consumeSetupRateLimit(
  db: D1Database,
  ip: string,
  now = Math.floor(Date.now() / 1000),
): Promise<{ allowed: boolean; retryAfter: number }> {
  const policies: RatePolicy[] = [
    { scope: `ip\n${ip}`, maximum: MAX_SETUP_ATTEMPTS_PER_IP },
    { scope: 'global', maximum: MAX_SETUP_ATTEMPTS_GLOBAL },
  ]
  for (const policy of policies) {
    const result = await consumeBucket(db, policy, now)
    if (!result.allowed) return result
  }
  return { allowed: true, retryAfter: 0 }
}
