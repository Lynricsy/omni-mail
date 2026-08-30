import type { SessionUser, UserRow } from '../../../app/types'

const PASSWORD_ALGORITHM = 'PBKDF2'
const PASSWORD_ITERATIONS = 100_000
const PASSWORD_HASH_BYTES = 32
const SESSION_SECONDS = 7 * 24 * 60 * 60

const encoder = new TextEncoder()

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    PASSWORD_ALGORITHM,
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: PASSWORD_ALGORITHM,
      hash: 'SHA-256',
      salt,
      iterations,
    },
    key,
    PASSWORD_HASH_BYTES * 8,
  )
  return new Uint8Array(bits)
}

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) return '密码至少需要 10 个字符。'
  if (password.length > 128) return '密码不能超过 128 个字符。'
  return null
}

export async function hashPassword(password: string, suppliedSalt?: Uint8Array): Promise<string> {
  const salt = suppliedSalt ?? crypto.getRandomValues(new Uint8Array(16))
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS)
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(derived)}`
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, hashText] = encoded.split('$')
  const iterations = Number(iterationsText)
  if (
    algorithm !== 'pbkdf2-sha256'
    || !Number.isSafeInteger(iterations)
    || iterations < 100_000
    || iterations > PASSWORD_ITERATIONS
    || !saltText
    || !hashText
  ) {
    return false
  }

  try {
    const expected = base64ToBytes(hashText)
    const actual = await derivePassword(password, base64ToBytes(saltText), iterations)
    return safeEqual(actual, expected)
  } catch {
    return false
  }
}

export async function consumePasswordCost(password: string): Promise<void> {
  await derivePassword(password, new Uint8Array(16), PASSWORD_ITERATIONS)
}

export async function sha256(value: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
}

export async function secretsEqual(provided: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256(provided), sha256(expected)])
  return safeEqual(encoder.encode(left), encoder.encode(right))
}

export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function storeSession(db: D1Database, userId: string, token: string): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS
  await db.prepare(
    'INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)',
  ).bind(await sha256(token), userId, expiresAt).run()
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256(token)).run()
}

export function activeUser(
  user: Pick<UserRow, 'role' | 'status' | 'temporary_expires_at' | 'deleted_at'>,
  now: number,
): boolean {
  return user.status === 'active'
    && user.deleted_at === null
    && (user.role !== 'temporary'
      || user.temporary_expires_at === null
      || user.temporary_expires_at > now)
}

export function sessionFromUser(user: Pick<
  UserRow,
  | 'id'
  | 'email'
  | 'display_name'
  | 'role'
  | 'mailbox_limit'
  | 'storage_quota_bytes'
  | 'storage_used_bytes'
  | 'can_create_mailboxes'
  | 'can_reply'
  | 'can_translate'
  | 'temporary_expires_at'
>): SessionUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    mailboxLimit: user.mailbox_limit,
    storageQuotaBytes: user.storage_quota_bytes,
    storageUsedBytes: user.storage_used_bytes,
    canCreateMailboxes: Boolean(user.can_create_mailboxes),
    canReply: Boolean(user.can_reply),
    canTranslate: user.role === 'super_admin'
      || user.role === 'admin'
      || Boolean(user.can_translate),
    temporaryExpiresAt: user.temporary_expires_at,
  }
}

export async function sessionUser(db: D1Database, token: string): Promise<SessionUser | null> {
  const now = Math.floor(Date.now() / 1000)
  const row = await db.prepare(
    `SELECT u.id, u.email, u.display_name, u.role, u.status,
            u.mailbox_limit, u.can_create_mailboxes, u.can_reply, u.can_translate,
            u.storage_quota_bytes, u.storage_used_bytes,
            u.temporary_expires_at, u.deleted_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), now).first<Pick<
    UserRow,
    | 'id'
    | 'email'
    | 'display_name'
    | 'role'
    | 'status'
    | 'mailbox_limit'
    | 'storage_quota_bytes'
    | 'storage_used_bytes'
    | 'can_create_mailboxes'
    | 'can_reply'
    | 'can_translate'
    | 'temporary_expires_at'
    | 'deleted_at'
  >>()

  if (!row || !activeUser(row, now)) return null
  return sessionFromUser(row)
}

export function applySuperAdminRole(
  user: SessionUser,
  configuredEmail: string | undefined,
): SessionUser {
  const superAdminEmail = configuredEmail?.trim().toLowerCase()
  if (!superAdminEmail || user.email.toLowerCase() !== superAdminEmail) return user
  return {
    ...user,
    role: 'super_admin',
    canCreateMailboxes: true,
    canReply: true,
    canTranslate: true,
  }
}

export const sessionMaxAge = SESSION_SECONDS
