import { DELIVERY_UNCERTAIN_PREFIX, OutboundDeliveryError } from './outbound-errors'
import type { OutboundProviderConfig } from './outbound-provider-config'

export type DeliveryPayload = {
  from: string
  to: string[]
  replyTo: string
  subject: string
  text: string
  html: string
  idempotencyKey: string
  headers: Record<string, string>
  attachments: Array<{ filename: string; content: string }>
}

function retryableProviderStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500
}

export async function deliverWithResend(
  config: OutboundProviderConfig,
  payload: DeliveryPayload,
): Promise<string> {
  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `omnimail-${payload.idempotencyKey}`,
        'User-Agent': 'OmniMail/0.1',
      },
      body: JSON.stringify({
        from: payload.from,
        to: payload.to,
        reply_to: payload.replyTo,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        attachments: payload.attachments.length ? payload.attachments : undefined,
        headers: payload.headers,
      }),
      signal: AbortSignal.timeout(payload.attachments.length ? 60_000 : 15_000),
    })
  } catch (error) {
    throw new OutboundDeliveryError(
      error instanceof Error ? error.message : 'Resend request failed',
    )
  }
  const result = await response.json<{ id?: string; message?: string }>()
    .catch(() => ({} as { id?: string; message?: string }))
  if (!response.ok || !result.id) {
    throw new OutboundDeliveryError(
      result.message || `Resend returned ${response.status}`,
      retryableProviderStatus(response.status),
    )
  }
  return result.id
}

export async function deliverWithSendflare(
  config: OutboundProviderConfig,
  payload: DeliveryPayload,
): Promise<string> {
  const batch = payload.to.length > 1
  let response: Response
  try {
    response = await fetch(`https://api.sendflare.com/v1/${batch ? 'batchSend' : 'send'}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'OmniMail/0.1',
      },
      body: JSON.stringify({
        from: config.from || payload.replyTo,
        to: batch ? payload.to : payload.to[0],
        subject: payload.subject,
        body: payload.html,
        replyTo: [payload.replyTo],
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw new OutboundDeliveryError(
      `${DELIVERY_UNCERTAIN_PREFIX}${error instanceof Error ? error.message : 'SendFlare request failed'}`,
      false,
      true,
    )
  }
  type SendflareResult = {
    success?: boolean
    message?: string
    requestId?: string
    data?: { emailId?: string; emilId?: string } | string[]
  }
  const result = await response.json<SendflareResult>()
    .catch(() => ({} as SendflareResult))
  const providerReference = Array.isArray(result.data)
    ? result.data.join(',') || result.requestId
    : result.data?.emailId || result.data?.emilId || result.requestId
  if (!response.ok || !result.success || !providerReference) {
    throw new OutboundDeliveryError(
      result.message || `SendFlare returned ${response.status}`,
      retryableProviderStatus(response.status),
    )
  }
  return `sendflare:${providerReference}`
}
