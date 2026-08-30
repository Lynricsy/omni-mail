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
  const source = env.QQ_MAIL_CREDENTIALS_KEY?.trim() || ''
  if (encoder.encode(source).byteLength < 32) {
    throw new Error('QQ_MAIL_CREDENTIALS_KEY is not configured')
  }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(source))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export function qqMailCredentialsReady(env: Env): boolean {
  return encoder.encode(env.QQ_MAIL_CREDENTIALS_KEY?.trim() || '').byteLength >= 32
}

export function qqMailImapEnabled(env: Env): boolean {
  return env.QQ_MAIL_IMAP_ENABLED !== 'false' && qqMailCredentialsReady(env)
}

export async function encryptQqMailCredential(
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

export async function decryptQqMailCredential(
  env: Env,
  value: string,
  context: string,
): Promise<string> {
  const [version, iv, ciphertext] = value.split('.')
  if (version !== 'v1' || !iv || !ciphertext) {
    throw new Error('Invalid encrypted QQ Mail credential')
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
    throw new Error('Unable to decrypt QQ Mail credential')
  }
}
