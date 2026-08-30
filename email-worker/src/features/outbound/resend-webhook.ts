import type { Env } from '../../app/types'

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

type ResendEvent = {
  type?: unknown
  created_at?: unknown
  data?: {
    email_id?: unknown
  }
}

const DELIVERY_STATUS = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
} as const

type DeliveryStatus = typeof DELIVERY_STATUS[keyof typeof DELIVERY_STATUS]

export function resendWebhookSecrets(env: Env): string[] | null {
  const legacy = env.RESEND_WEBHOOK_SECRET?.trim()
  const raw = env.RESEND_WEBHOOK_SECRETS?.trim()
  if (!raw) return legacy ? [legacy] : []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      !Array.isArray(parsed)
      || !parsed.length
      || parsed.some((value) => typeof value !== 'string' || !value.trim())
    ) return null
    return [...new Set([
      ...parsed.map((value) => value.trim()),
      ...(legacy ? [legacy] : []),
    ])]
  } catch {
    return null
  }
}

function base64Bytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=')
    return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index]
  }
  return difference === 0
}

export async function validResendSignature(
  payload: string,
  headers: Headers,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const id = headers.get('svix-id')?.trim() || ''
  const timestampText = headers.get('svix-timestamp')?.trim() || ''
  const timestamp = Number(timestampText)
  const signatures = (headers.get('svix-signature') || '')
    .split(/\s+/)
    .map((item) => item.startsWith('v1,') ? base64Bytes(item.slice(3)) : null)
    .filter((item): item is Uint8Array => Boolean(item))
  const encodedSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const secretBytes = base64Bytes(encodedSecret)
  if (
    !id
    || !Number.isSafeInteger(timestamp)
    || Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS
    || !secretBytes
    || !signatures.length
  ) return false
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const expected = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestampText}.${payload}`),
  ))
  return signatures.some((signature) => timingSafeEqual(signature, expected))
}

function eventTime(value: unknown): number {
  if (typeof value !== 'string') return Math.floor(Date.now() / 1000)
  const parsed = Math.floor(Date.parse(value) / 1000)
  return Number.isSafeInteger(parsed) ? parsed : Math.floor(Date.now() / 1000)
}

function allowedPreviousStatuses(status: DeliveryStatus): string[] {
  if (status === 'sent') return ['queued', 'sent']
  if (status === 'delayed') return ['queued', 'sent', 'delayed']
  return ['queued', 'sent', 'delayed', 'delivered']
}

async function updateDeliveryStatus(
  env: Env,
  providerId: string,
  status: DeliveryStatus,
  createdAt: number,
): Promise<D1PreparedStatement> {
  const previous = allowedPreviousStatuses(status)
  const placeholders = previous.map(() => '?').join(', ')
  return env.DB.prepare(
    `UPDATE messages
        SET delivery_status = ?, provider_event_at = ?, updated_at = unixepoch()
      WHERE provider_id = ?
        AND (provider_event_at IS NULL OR provider_event_at <= ?)
        AND (delivery_status IS NULL OR delivery_status IN (${placeholders}))`,
  ).bind(status, createdAt, providerId, createdAt, ...previous)
}

export async function reconcileResendEvents(
  env: Env,
  providerId: string,
  messageId: string,
): Promise<void> {
  const event = await env.DB.prepare(
    `SELECT event_type, created_at FROM resend_webhook_events
      WHERE provider_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(providerId).first<{ event_type: string; created_at: number }>()
  if (!event) return
  const status = DELIVERY_STATUS[event.event_type as keyof typeof DELIVERY_STATUS]
  if (!status) return
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE resend_webhook_events SET message_id = ? WHERE provider_id = ?',
    ).bind(messageId, providerId),
    await updateDeliveryStatus(env, providerId, status, event.created_at),
  ])
}

export async function handleResendWebhook(env: Env, request: Request): Promise<Response> {
  const secrets = resendWebhookSecrets(env)
  if (secrets === null) {
    return Response.json({ error: 'RESEND_WEBHOOK_SECRETS contains invalid JSON.' }, { status: 503 })
  }
  if (!secrets.length) {
    return Response.json({ error: 'Resend webhook is not configured.' }, { status: 503 })
  }
  const payload = await request.text()
  const signatures = await Promise.all(secrets.map((secret) => (
    validResendSignature(payload, request.headers, secret).catch(() => false)
  )))
  if (!signatures.some(Boolean)) {
    return Response.json({ error: 'Invalid webhook signature.' }, { status: 400 })
  }
  let event: ResendEvent
  try {
    event = JSON.parse(payload) as ResendEvent
  } catch {
    return Response.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  }
  const eventId = request.headers.get('svix-id')?.trim() || ''
  const eventType = typeof event.type === 'string' ? event.type : ''
  const providerId = typeof event.data?.email_id === 'string' ? event.data.email_id.trim() : ''
  const status = DELIVERY_STATUS[eventType as keyof typeof DELIVERY_STATUS]
  if (!eventId || !eventType || !providerId || !status) return Response.json({ ok: true })
  const createdAt = eventTime(event.created_at)
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO resend_webhook_events (
        event_id, message_id, provider_id, event_type, created_at
      ) VALUES (?, (SELECT id FROM messages WHERE provider_id = ?), ?, ?, ?)`,
    ).bind(eventId, providerId, providerId, eventType, createdAt),
    await updateDeliveryStatus(env, providerId, status, createdAt),
  ])
  return Response.json({ ok: true })
}
