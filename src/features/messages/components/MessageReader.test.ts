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
import { forceLightEmailColorScheme, normalizeRemoteImageSource } from '../../../shared/mail/emailContent'
import { fitEmailDocument } from '../../../shared/ui/mail-workspace/hooks/useSmoothEmailFrame'
import { subjectPassedReaderTop } from '../../../shared/ui/mail-workspace/hooks/useMessageReaderScroll'
import { typewriterFrame } from '../../../shared/ui/mail-workspace/MessageReaderToolbarTitle'

describe('message reader scroll navigation', () => {
  it('pins the subject only after it has passed the reader top edge', () => {
    expect(subjectPassedReaderTop(120, 70, true)).toBe(false)
    expect(subjectPassedReaderTop(60, 70, false)).toBe(true)
    expect(subjectPassedReaderTop(120, 70, false)).toBe(false)
  })

  it('erases and types text in both toolbar-title directions', () => {
    expect(typewriterFrame('邮件详情', 'Apple Invites', 0)).toEqual({
      text: '邮件详情', complete: false,
    })
    expect(typewriterFrame('邮件详情', 'Apple Invites', 80).text).toBe('')
    expect(typewriterFrame('邮件详情', 'Apple Invites', 10_000)).toEqual({
      text: 'Apple Invites', complete: true,
    })
    expect(typewriterFrame('Apple Invites', '邮件详情', 10_000)).toEqual({
      text: '邮件详情', complete: true,
    })
  })
})

describe('email remote image policy', () => {
  it('blocks remote image protocols by default', () => {
    expect(emailImageSources(false)).toBe('data: blob:')
  })

  it('allows only proxied same-origin images when enabled', () => {
    expect(emailImageSources(
      true,
      'https://mail.example.com/api/remote-images',
    )).toBe('data: blob: https://mail.example.com/api/remote-images')
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

  it('skips element geometry scans when the document already fits', () => {
    const style = { removeProperty: () => undefined, setProperty: () => undefined }
    const document = {
      body: {
        style,
        offsetHeight: 600,
        scrollHeight: 600,
        scrollWidth: 600,
        getBoundingClientRect: () => { throw new Error('geometry scan was not skipped') },
      },
      documentElement: {
        clientWidth: 600,
        offsetHeight: 600,
        scrollHeight: 600,
        scrollWidth: 600,
      },
    } as unknown as Document

    expect(fitEmailDocument(document)).toBe(600)
  })

  it('reveals only the prepared version of the current HTML message', () => {
    const prepared = { messageId: 'message-1', document: '<p>Ready</p>' }
    expect(emailFrameReady('message-1', '', '', null)).toBe(true)
    expect(emailFrameReady('message-1', '<p>Ready</p>', '<p>Ready</p>', null)).toBe(false)
    expect(emailFrameReady('message-2', '<p>Ready</p>', '<p>Ready</p>', prepared)).toBe(false)
    expect(emailFrameReady('message-1', '<p>Updated</p>', '<p>Updated</p>', prepared)).toBe(false)
    expect(emailFrameReady('message-1', '<p>Ready</p>', '<p>Ready</p>', prepared)).toBe(true)
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
