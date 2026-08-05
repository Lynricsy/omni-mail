import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxyRemoteImage, safeRemoteImageUrl } from './remote-image'

afterEach(() => vi.unstubAllGlobals())

describe('remote image proxy', () => {
  it('allows public HTTPS image URLs', () => {
    expect(safeRemoteImageUrl('https://claude.ai/images/claude_logo_full.png')?.href).toBe(
      'https://claude.ai/images/claude_logo_full.png',
    )
    expect(safeRemoteImageUrl('https://emails.resend.com/static/logo-v2.png')?.href).toBe(
      'https://emails.resend.com/static/logo-v2.png',
    )
  })

  it('rejects credentials, custom ports, non-HTTPS URLs, and local hosts', () => {
    expect(safeRemoteImageUrl('https://user@claude.ai/images/logo.png')).toBeNull()
    expect(safeRemoteImageUrl('https://claude.ai:8443/images/logo.png')).toBeNull()
    expect(safeRemoteImageUrl('http://claude.ai/images/logo.png')).toBeNull()
    expect(safeRemoteImageUrl('https://localhost/logo.png')).toBeNull()
    expect(safeRemoteImageUrl('https://127.0.0.1/logo.png')).toBeNull()
  })

  it('returns the image without forwarding the upstream cross-origin restriction', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('image', {
      headers: {
        'Content-Type': 'image/png',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    })))

    const response = await proxyRemoteImage(new Request(
      'https://mail.example/api/remote-images?url=https%3A%2F%2Fclaude.ai%2Fimages%2Fclaude_logo_full.png',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBeNull()
  })

  it('follows only redirects that remain safe HTTPS image URLs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { Location: 'https://cdn.resend.com/logo.png' },
      }))
      .mockResolvedValueOnce(new Response('image', {
        headers: { 'Content-Type': 'image/png' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await proxyRemoteImage(new Request(
      'https://mail.example/api/remote-images?url=https%3A%2F%2Femails.resend.com%2Fstatic%2Flogo-v2.png',
    ))

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops reading an image when it exceeds the size limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      new Uint8Array(5 * 1024 * 1024 + 1),
      { headers: { 'Content-Type': 'image/png' } },
    )))

    const response = await proxyRemoteImage(new Request(
      'https://mail.example/api/remote-images?url=https%3A%2F%2Femails.resend.com%2Fstatic%2Flogo-v2.png',
    ))

    expect(response.status).toBe(413)
  })
})
