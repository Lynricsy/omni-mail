import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api-client'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('API request timeouts', () => {
  it('allows startup requests to survive a slow D1 cold path', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ user: null })))

    await api.config()
    await api.session()

    expect(timeout).toHaveBeenNthCalledWith(1, 30_000)
    expect(timeout).toHaveBeenNthCalledWith(2, 30_000)
  })

  it('uses the extended timeout for slow attachment and translation operations', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      attachment: {},
      translation: {},
    })))

    await api.uploadDraftAttachment('draft-1', new File(['x'], 'x.txt'))
    await api.translateMessage('message-1', 'en')

    expect(timeout).toHaveBeenCalledWith(60_000)
    expect(timeout).not.toHaveBeenCalledWith(15_000)
  })

  it('gives Gmail manual enqueue requests a longer fallback timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ queued: true })))

    await api.syncGmail('gmail-1')

    expect(timeout).toHaveBeenCalledWith(30_000)
  })
})
