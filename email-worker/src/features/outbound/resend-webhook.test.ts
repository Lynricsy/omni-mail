import { describe, expect, it } from 'vitest'
import { handleResendWebhook, validResendSignature } from './resend-webhook'
import type { Env } from '../../app/types'

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

async function signedHeaders(payload: string, secretBytes: Uint8Array, now: number): Promise<Headers> {
  const id = 'evt_123'
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${now}.${payload}`),
  ))
  return new Headers({
    'svix-id': id,
    'svix-timestamp': String(now),
    'svix-signature': `v1,${base64(signature)}`,
  })
}

describe('Resend webhook', () => {
  it('verifies the raw payload and rejects stale signatures', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32))
    const now = 1_800_000_000
    const payload = '{"type":"email.delivered"}'
    const headers = await signedHeaders(payload, secret, now)

    await expect(validResendSignature(payload, headers, `whsec_${base64(secret)}`, now))
      .resolves.toBe(true)
    await expect(validResendSignature(payload, headers, `whsec_${base64(secret)}`, now + 301))
      .resolves.toBe(false)
  })

  it('accepts a signature from any configured Resend account', async () => {
    const firstSecret = crypto.getRandomValues(new Uint8Array(32))
    const secondSecret = crypto.getRandomValues(new Uint8Array(32))
    const now = Math.floor(Date.now() / 1000)
    const payload = '{}'
    const headers = await signedHeaders(payload, secondSecret, now)
    const env = {
      RESEND_WEBHOOK_SECRETS: JSON.stringify([
        `whsec_${base64(firstSecret)}`,
        `whsec_${base64(secondSecret)}`,
      ]),
    } as Env

    const response = await handleResendWebhook(env, new Request(
      'https://mail.example/api/webhooks/resend',
      { method: 'POST', headers, body: payload },
    ))

    expect(response.status).toBe(200)
  })

  it('rejects signatures outside the configured Resend accounts', async () => {
    const configuredSecret = crypto.getRandomValues(new Uint8Array(32))
    const unknownSecret = crypto.getRandomValues(new Uint8Array(32))
    const now = Math.floor(Date.now() / 1000)
    const payload = '{}'
    const headers = await signedHeaders(payload, unknownSecret, now)
    const env = {
      RESEND_WEBHOOK_SECRETS: JSON.stringify([`whsec_${base64(configuredSecret)}`]),
    } as Env

    const response = await handleResendWebhook(env, new Request(
      'https://mail.example/api/webhooks/resend',
      { method: 'POST', headers, body: payload },
    ))

    expect(response.status).toBe(400)
  })

  it('fails closed when the multi-account secret configuration is invalid', async () => {
    const env = {
      RESEND_WEBHOOK_SECRET: 'whsec_legacy',
      RESEND_WEBHOOK_SECRETS: '{invalid',
    } as Env

    const response = await handleResendWebhook(env, new Request(
      'https://mail.example/api/webhooks/resend',
      { method: 'POST', body: '{}' },
    ))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'RESEND_WEBHOOK_SECRETS contains invalid JSON.',
    })
  })

  it('stores a signed delivery event and reconciles the message', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32))
    const now = Math.floor(Date.now() / 1000)
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date(now * 1000).toISOString(),
      data: { email_id: 'provider-1' },
    })
    const headers = await signedHeaders(payload, secret, now)
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const prepare = (sql: string) => ({
      bind(...bindings: unknown[]) {
        statements.push({ sql, bindings })
        return this
      },
    })
    const env = {
      RESEND_WEBHOOK_SECRET: `whsec_${base64(secret)}`,
      DB: { prepare, batch: async () => [] },
    } as unknown as Env

    const response = await handleResendWebhook(env, new Request(
      'https://mail.example/api/webhooks/resend',
      { method: 'POST', headers, body: payload },
    ))

    expect(response.status).toBe(200)
    expect(statements.some(({ sql, bindings }) => (
      sql.includes('resend_webhook_events') && bindings.includes('provider-1')
    ))).toBe(true)
    expect(statements.some(({ sql, bindings }) => (
      sql.includes('UPDATE messages') && bindings[0] === 'delivered'
    ))).toBe(true)
  })

  it('rejects a signed payload that is not valid JSON', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32))
    const now = Math.floor(Date.now() / 1000)
    const payload = '{'
    const headers = await signedHeaders(payload, secret, now)
    const env = {
      RESEND_WEBHOOK_SECRET: `whsec_${base64(secret)}`,
    } as Env

    const response = await handleResendWebhook(env, new Request(
      'https://mail.example/api/webhooks/resend',
      { method: 'POST', headers, body: payload },
    ))

    expect(response.status).toBe(400)
  })
})
