import { activeUser, createSessionToken, sha256 } from '../session/auth'
import type { Env, UserRow } from '../../../app/types'

const TOTP_PERIOD_SECONDS = 30
const MFA_CHALLENGE_SECONDS = 5 * 60
const MAX_CHALLENGE_ATTEMPTS = 5
const MFA_RATE_WINDOW_SECONDS = 15 * 60
const MAX_MFA_ATTEMPTS = 10
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

type MfaChallengeRow = UserRow & {
  channel: 'browser' | 'linuxdo'
  expires_at: number
  attempts: number
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0))
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let result = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) result += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return result
}

function base32Decode(value: string): Uint8Array {
  let bits = 0
  let buffer = 0
  const output: number[] = []
  for (const character of value.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    const index = BASE32_ALPHABET.indexOf(character)
    if (index < 0) throw new Error('Invalid base32 value')
    buffer = (buffer << 5) | index
    bits += 5
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(output)
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)))
}

export async function totpCode(secret: string, timestamp = Date.now()): Promise<string> {
  let counter = BigInt(Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS))
  const counterBytes = new Uint8Array(8)
  for (let index = 7; index >= 0; index -= 1) {
    counterBytes[index] = Number(counter & 255n)
    counter >>= 8n
  }
  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes))
  const offset = digest[digest.length - 1] & 15
  const binary = (
    ((digest[offset] & 127) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3]
  )
  return String(binary % 1_000_000).padStart(6, '0')
}

export async function verifyTotp(
  secret: string,
  code: string,
  timestamp = Date.now(),
): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false
  const candidates = await Promise.all([-1, 0, 1].map((offset) => (
    totpCode(secret, timestamp + offset * TOTP_PERIOD_SECONDS * 1000)
  )))
  return candidates.some((candidate) => candidate === code)
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
  const source = env.TOTP_ENCRYPTION_KEY?.trim() || ''
  if (source.length < 32) throw new Error('TOTP_ENCRYPTION_KEY is not configured')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export function mfaConfigurationReady(env: Env): boolean {
  return (env.TOTP_ENCRYPTION_KEY?.trim().length || 0) >= 32
}

export async function encryptTotpSecret(env: Env, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(env),
    new TextEncoder().encode(secret),
  )
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`
}

async function decryptTotpSecret(env: Env, encrypted: string): Promise<string> {
  const [version, iv, ciphertext] = encrypted.split('.')
  if (version !== 'v1' || !iv || !ciphertext) throw new Error('Invalid encrypted TOTP secret')
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlBytes(iv) },
    await encryptionKey(env),
    base64UrlBytes(ciphertext),
  )
  return new TextDecoder().decode(decrypted)
}

export async function verifyEncryptedTotp(
  env: Env,
  encrypted: string,
  code: string,
): Promise<boolean> {
  return verifyTotp(await decryptTotpSecret(env, encrypted), code.trim())
}

export async function mfaEnabled(db: D1Database, userId: string): Promise<boolean> {
  const row = await db.prepare(
    'SELECT enabled_at FROM admin_totp WHERE user_id = ?',
  ).bind(userId).first<{ enabled_at: number | null }>()
  return Boolean(row?.enabled_at)
}

export async function createMfaChallenge(
  db: D1Database,
  userId: string,
  channel: 'browser' | 'linuxdo',
): Promise<string> {
  const token = createSessionToken()
  const now = Math.floor(Date.now() / 1000)
  await db.prepare(
    `INSERT INTO mfa_challenges (token_hash, user_id, channel, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(await sha256(token), userId, channel, now + MFA_CHALLENGE_SECONDS).run()
  return token
}

function normalizeRecoveryCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z2-7]/g, '')
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const value = base32Encode(crypto.getRandomValues(new Uint8Array(10)))
    return value.match(/.{1,4}/g)?.join('-') || value
  })
}

export async function recoveryCodeHash(code: string): Promise<string> {
  return sha256(normalizeRecoveryCode(code))
}

export async function consumeMfaChallenge(
  db: D1Database,
  tokenHash: string,
): Promise<boolean> {
  const consumed = await db.prepare(
    'DELETE FROM mfa_challenges WHERE token_hash = ?',
  ).bind(tokenHash).run()
  return Boolean(consumed.meta.changes)
}

export async function verifyMfaForUser(
  env: Env,
  userId: string,
  rawCode: string,
): Promise<{ ok: boolean; recovery: boolean }> {
  const row = await env.DB.prepare(
    'SELECT encrypted_secret, enabled_at FROM admin_totp WHERE user_id = ?',
  ).bind(userId).first<{ encrypted_secret: string; enabled_at: number | null }>()
  if (!row?.enabled_at) return { ok: true, recovery: false }
  const code = rawCode.trim()
  if (!/^\d{6}$/.test(code)) {
    const used = await env.DB.prepare(
      `UPDATE mfa_recovery_codes SET used_at = unixepoch()
        WHERE user_id = ? AND code_hash = ? AND used_at IS NULL`,
    ).bind(userId, await recoveryCodeHash(code)).run()
    return { ok: Boolean(used.meta.changes), recovery: Boolean(used.meta.changes) }
  }
  return { ok: await verifyEncryptedTotp(env, row.encrypted_secret, code), recovery: false }
}

export async function verifyMfaForLogin(
  env: Env,
  userId: string,
  rawCode: string,
  ip: string,
): Promise<{ ok: boolean; recovery: boolean; rateLimited: boolean }> {
  const keyHash = await sha256(`mfa\n${ip}\n${userId}`)
  const now = Math.floor(Date.now() / 1000)
  const current = await env.DB.prepare(
    'SELECT attempts, window_started_at FROM login_attempts WHERE key_hash = ?',
  ).bind(keyHash).first<{ attempts: number; window_started_at: number }>()
  if (
    current
    && now - current.window_started_at < MFA_RATE_WINDOW_SECONDS
    && current.attempts >= MAX_MFA_ATTEMPTS
  ) return { ok: false, recovery: false, rateLimited: true }
  const result = await verifyMfaForUser(env, userId, rawCode)
  if (result.ok) {
    await env.DB.prepare('DELETE FROM login_attempts WHERE key_hash = ?').bind(keyHash).run()
    return { ...result, rateLimited: false }
  }
  const resetBefore = now - MFA_RATE_WINDOW_SECONDS
  await env.DB.prepare(
    `INSERT INTO login_attempts (key_hash, attempts, window_started_at)
     VALUES (?, 1, ?)
     ON CONFLICT(key_hash) DO UPDATE SET
       attempts = CASE WHEN login_attempts.window_started_at < ? THEN 1 ELSE attempts + 1 END,
       window_started_at = CASE
         WHEN login_attempts.window_started_at < ? THEN excluded.window_started_at
         ELSE login_attempts.window_started_at
       END`,
  ).bind(keyHash, now, resetBefore, resetBefore).run()
  return { ...result, rateLimited: false }
}

export async function completeMfaChallenge(
  env: Env,
  token: string,
  code: string,
  ip: string,
): Promise<{ user?: UserRow; channel?: 'browser' | 'linuxdo'; recovery?: boolean; error?: string }> {
  const now = Math.floor(Date.now() / 1000)
  const tokenHash = await sha256(token)
  const row = await env.DB.prepare(
    `SELECT c.channel, c.expires_at, c.attempts,
            u.id, u.email, u.display_name, u.password_hash, u.role, u.status,
            u.mailbox_limit, u.storage_quota_bytes, u.storage_used_bytes,
            u.can_create_mailboxes, u.can_reply, u.can_translate, u.temporary_expires_at,
            u.deleted_at, u.created_at
       FROM mfa_challenges c
       JOIN users u ON u.id = c.user_id
      WHERE c.token_hash = ?`,
  ).bind(tokenHash).first<MfaChallengeRow>()
  if (
    !row
    || row.expires_at <= now
    || row.attempts >= MAX_CHALLENGE_ATTEMPTS
    || !activeUser(row, now)
  ) {
    await env.DB.prepare('DELETE FROM mfa_challenges WHERE token_hash = ?').bind(tokenHash).run()
    return { error: '二次验证已过期，请重新登录。' }
  }
  const result = await verifyMfaForLogin(env, row.id, code, ip)
  if (!result.ok) {
    await env.DB.prepare(
      'UPDATE mfa_challenges SET attempts = attempts + 1 WHERE token_hash = ?',
    ).bind(tokenHash).run()
    return { error: result.rateLimited
      ? '二次验证尝试过多，请 15 分钟后再试。'
      : '验证码或恢复码不正确。' }
  }
  if (!await consumeMfaChallenge(env.DB, tokenHash)) {
    return { error: '二次验证已被使用，请重新登录。' }
  }
  return { user: row, channel: row.channel, recovery: result.recovery }
}
