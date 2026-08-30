import { readFileSync } from 'node:fs'
import PostalMime from 'postal-mime'
import { describe, expect, it } from 'vitest'

function fixture(name: string): Buffer {
  return readFileSync(new URL(`../../../test-fixtures/${name}`, import.meta.url))
}

describe('representative MIME messages', () => {
  it('keeps the Claude logo and secure login link in HTML', async () => {
    const parsed = await PostalMime.parse(fixture('claude-secure-link.eml'))
    expect(parsed.subject).toBe('Secure link to log in to Claude.ai')
    expect(parsed.html).toContain('https://claude.ai/images/claude_logo_full.png')
    expect(parsed.html).toContain('https://claude.ai/login?token=fixture')
    expect(parsed.text).toContain('Sign in to Claude.ai')
  })

  it('exposes inline CID images as related attachments', async () => {
    const parsed = await PostalMime.parse(fixture('inline-cid.eml'))
    expect(parsed.html).toContain('cid:brand-logo@example.net')
    expect(parsed.attachments).toHaveLength(1)
    expect(parsed.attachments[0]).toMatchObject({
      filename: 'logo.png',
      contentId: '<brand-logo@example.net>',
      disposition: 'inline',
      mimeType: 'image/png',
    })
  })

  it('decodes Outlook-style folded thread headers and quoted printable bodies', async () => {
    const parsed = await PostalMime.parse(fixture('outlook-thread.eml'))
    expect(parsed.subject).toBe('Re: Project update')
    expect(parsed.inReplyTo).toBe('<outlook-root-1@example.org>')
    expect(parsed.references).toBe(
      '<outlook-root-1@example.org> <outlook-reply-1@example.org>',
    )
    expect(parsed.text).toContain('The project is ready.')
  })
})
