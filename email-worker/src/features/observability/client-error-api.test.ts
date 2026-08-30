import { describe, expect, it, vi } from 'vitest'
import { recordClientError } from './client-error-api'
import type { SessionUser } from '../../app/types'

const user = { id: 'user-1' } as SessionUser

describe('client error reporting', () => {
  it('writes an authenticated, sanitized structured crash event', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await recordClientError(new Request('https://mail.example/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Browser 1.0' },
      body: JSON.stringify({
        crashId: 'ui-abc123', errorName: 'TypeError',
        message: 'owner@example.com failed', componentStack: '\n at Mailbox', path: '/mail/inbox',
      }),
    }), user, 'cookie')

    expect(response.status).toBe(204)
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      event: 'client_ui_crash', crash_id: 'ui-abc123', user_id: 'user-1',
      error_message: '[email] failed', user_agent: 'Browser 1.0',
    }))
    write.mockRestore()
  })

  it('rejects malformed diagnostic ids without writing a log', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await recordClientError(new Request('https://mail.example/api/client-errors', {
      method: 'POST', body: JSON.stringify({ crashId: 'invalid' }),
    }), user, 'cookie')
    expect(response.status).toBe(400)
    expect(write).not.toHaveBeenCalled()
    write.mockRestore()
  })
})
