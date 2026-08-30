import { describe, expect, it, vi } from 'vitest'
import { errorLogFields, logWorkerError, safeLogText } from './structured-log'

describe('structured Worker diagnostics', () => {
  it('removes control characters and common credential-shaped values', () => {
    expect(safeLogText(
      'owner@example.com\nAuthorization=top-secret https://example.com/private',
    )).toBe('[email] Authorization=[redacted] [url]')
  })

  it('keeps safe error classification fields without a stack trace', () => {
    const error = Object.assign(new Error('IMAP command failed'), {
      status: 502,
      definitive: true,
    })
    expect(errorLogFields(error)).toEqual({
      error_type: 'Error',
      error_message: 'IMAP command failed',
      error_status: 502,
      error_definitive: true,
    })
  })

  it('writes one filterable structured error event', () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logWorkerError('qq_mail_sync_failed', { stage: 'search' }, new Error('failed'))
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error', event: 'qq_mail_sync_failed', stage: 'search', error_type: 'Error',
    }))
    write.mockRestore()
  })
})
