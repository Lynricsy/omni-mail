import type { Env } from '../../app/types'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0))
}

async function credentialKey(env: Env): Promise<CryptoKey> {
  const source = env.YANDEX_MAIL_CREDENTIALS_KEY?.trim() || ''
  if (encoder.encode(source).byteLength < 32) {
    throw new Error('YANDEX_MAIL_CREDENTIALS_KEY is not configured')
  }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(source))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export function yandexMailCredentialsReady(env: Env): boolean {
  return encoder.encode(env.YANDEX_MAIL_CREDENTIALS_KEY?.trim() || '').byteLength >= 32
}

export function yandexMailImapEnabled(env: Env): boolean {
  return env.YANDEX_MAIL_IMAP_ENABLED === 'true' && yandexMailCredentialsReady(env)
}

export async function encryptYandexMailCredential(
  env: Env,
  value: string,
  context: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    await credentialKey(env),
    encoder.encode(value),
  )
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`
}

export async function decryptYandexMailCredential(
  env: Env,
  value: string,
  context: string,
): Promise<string> {
  const [version, iv, ciphertext] = value.split('.')
  if (version !== 'v1' || !iv || !ciphertext) {
    throw new Error('Invalid encrypted Yandex Mail credential')
  }
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64UrlBytes(iv),
        additionalData: encoder.encode(context),
      },
      await credentialKey(env),
      base64UrlBytes(ciphertext),
    )
    return decoder.decode(decrypted)
  } catch {
    throw new Error('Unable to decrypt Yandex Mail credential')
  }
}
