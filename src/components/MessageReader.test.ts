import { describe, expect, it } from 'vitest'
import {
  EMAIL_FRAME_SANDBOX,
  emailDocumentHeight,
  emailFrameReady,
  emailImageSources,
  emailLinkHref,
  normalizeContentId,
  safeEmailHref,
  shouldProxyRemoteImage,
} from './MessageReader'
import { forceLightEmailColorScheme, normalizeRemoteImageSource } from '../lib/emailContent'

describe('email remote image policy', () => {
  it('blocks remote image protocols by default', () => {
    expect(emailImageSources(false)).toBe('data:')
  })

  it('allows only proxied same-origin images when enabled', () => {
    expect(emailImageSources(
      true,
      'https://mail.example.com/api/remote-images',
    )).toBe('data: https://mail.example.com/api/remote-images')
  })

  it('proxies public web images through HTTPS', () => {
    expect(shouldProxyRemoteImage('https://claude.ai/images/claude_logo_full.png')).toBe(true)
    expect(shouldProxyRemoteImage('https://emails.resend.com/static/logo-v2.png')).toBe(true)
    expect(shouldProxyRemoteImage('http://assets.vodafone.co.uk/logo.gif')).toBe(true)
    expect(normalizeRemoteImageSource('http://assets.vodafone.co.uk/logo.gif')).toBe(
      'https://assets.vodafone.co.uk/logo.gif',
    )
    expect(shouldProxyRemoteImage('https://user@example.com/images/logo.png')).toBe(false)
  })
})

describe('email frame layout', () => {
  it('uses the full document height with a stable minimum', () => {
    expect(emailDocumentHeight({
      body: { offsetHeight: 790, scrollHeight: 820 },
      documentElement: { offsetHeight: 800, scrollHeight: 810 },
    } as unknown as Document)).toBe(820)
    expect(emailDocumentHeight({
      body: { offsetHeight: 100, scrollHeight: 100 },
      documentElement: { offsetHeight: 100, scrollHeight: 100 },
    } as unknown as Document)).toBe(470)
  })

  it('reveals only the prepared version of the current HTML message', () => {
    const prepared = { messageId: 'message-1', document: '<p>Ready</p>' }
    expect(emailFrameReady('message-1', '', '', false, null)).toBe(true)
    expect(emailFrameReady('message-1', '<p>Ready</p>', '<p>Ready</p>', false, null)).toBe(false)
    expect(emailFrameReady('message-1', '<p>Ready</p>', '<p>Ready</p>', true, prepared)).toBe(false)
    expect(emailFrameReady('message-2', '<p>Ready</p>', '<p>Ready</p>', false, prepared)).toBe(false)
    expect(emailFrameReady('message-1', '<p>Updated</p>', '<p>Updated</p>', false, prepared)).toBe(false)
    expect(emailFrameReady('message-1', '<p>Ready</p>', '<p>Ready</p>', false, prepared)).toBe(true)
  })
})

describe('email content safety', () => {
  it('keeps scripts disabled so noscript email bodies remain visible', () => {
    expect(EMAIL_FRAME_SANDBOX).toBe('allow-same-origin')
    expect(EMAIL_FRAME_SANDBOX).not.toContain('allow-scripts')
  })

  it('normalizes content IDs used by inline images', () => {
    expect(normalizeContentId('cid:%3Cclaude-logo%40mail%3E')).toBe('claude-logo@mail')
    expect(normalizeContentId('<claude-logo@mail>')).toBe('claude-logo@mail')
  })

  it('keeps sender dark-mode rules from conflicting with the light email canvas', () => {
    expect(forceLightEmailColorScheme(`
      @media (prefers-color-scheme: dark) { .content { color: white; } }
      @media (PREFERS-COLOR-SCHEME : LIGHT) { .content { color: black; } }
    `)).toContain('@media (prefers-color-scheme: omnimail-disabled)')
    expect(forceLightEmailColorScheme(
      '@media (PREFERS-COLOR-SCHEME : DARK) {}',
    )).toContain('(prefers-color-scheme: omnimail-disabled)')
  })

  it('allows absolute web links and rejects active or relative URLs', () => {
    expect(safeEmailHref('https://claude.ai/login?token=example')).toBe(
      'https://claude.ai/login?token=example',
    )
    expect(safeEmailHref('javascript:alert(1)')).toBeNull()
    expect(safeEmailHref('/api/logout')).toBeNull()
  })

  it('reads links from iframe elements without relying on the parent realm', () => {
    const iframeTarget = {
      closest: () => ({ dataset: { omnimailHref: 'https://claude.ai/login' } }),
    } as unknown as EventTarget

    expect(emailLinkHref(iframeTarget)).toBe('https://claude.ai/login')
  })
})
