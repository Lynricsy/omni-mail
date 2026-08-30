import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAIL_SYNC_LIMIT,
  parseMailSyncLimit,
  requestedMailSyncLimit,
} from './sync-limit'

describe('IMAP synchronization limits', () => {
  it('accepts only supported limits', () => {
    expect(parseMailSyncLimit(10)).toBe(10)
    expect(parseMailSyncLimit(20)).toBe(20)
    expect(parseMailSyncLimit(50)).toBe(50)
    expect(parseMailSyncLimit(100)).toBeNull()
    expect(parseMailSyncLimit('20')).toBeNull()
  })

  it('keeps empty legacy requests on the safe default', async () => {
    await expect(requestedMailSyncLimit(new Request('https://example.test', {
      method: 'POST',
    }))).resolves.toBe(DEFAULT_MAIL_SYNC_LIMIT)
  })

  it('rejects malformed and unsupported request bodies', async () => {
    await expect(requestedMailSyncLimit(new Request('https://example.test', {
      method: 'POST', body: '{',
    }))).rejects.toThrow()
    await expect(requestedMailSyncLimit(new Request('https://example.test', {
      method: 'POST', body: JSON.stringify({ limit: 100 }),
    }))).rejects.toThrow()
  })
})
