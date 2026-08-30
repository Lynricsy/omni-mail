import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliverWithSendflare, type DeliveryPayload } from './outbound-http-provider'

const payload: DeliveryPayload = {
  from: 'Owner <owner@example.com>',
  to: ['first@example.net', 'second@example.net'],
  replyTo: 'owner@example.com',
  subject: 'Hello',
  text: 'Message body',
  html: '<p>Message body</p>',
  idempotencyKey: 'request_batch',
  headers: {},
  attachments: [],
}

afterEach(() => vi.unstubAllGlobals())

describe('SendFlare delivery', () => {
  it('uses the batch endpoint for multiple recipients', async () => {
    const sendflare = vi.fn(async () => Response.json({
      success: true,
      data: ['sendflare-1', 'sendflare-2'],
    }))
    vi.stubGlobal('fetch', sendflare)

    await expect(deliverWithSendflare({
      provider: 'sendflare',
      apiKey: 'sf_example',
      from: 'mail@example.com',
    }, payload)).resolves.toBe('sendflare:sendflare-1,sendflare-2')

    const [url, request] = sendflare.mock.calls[0]
    expect(url).toBe('https://api.sendflare.com/v1/batchSend')
    expect(JSON.parse(String(request?.body))).toMatchObject({
      from: 'mail@example.com',
      to: ['first@example.net', 'second@example.net'],
      replyTo: ['owner@example.com'],
    })
  })
})
