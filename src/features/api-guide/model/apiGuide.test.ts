import { describe, expect, it } from 'vitest'
import { apiGuideSnippets } from './apiGuide'

describe('API guide snippets', () => {
  it('uses the current instance URL for every request example', () => {
    const snippets = apiGuideSnippets('https://mail.example.com/')

    expect(snippets.baseUrl).toBe('https://mail.example.com/api')
    expect(snippets.issueToken).toContain('https://mail.example.com/api/auth/token')
    expect(snippets.examples.curl).toContain('https://mail.example.com/api/messages')
    expect(snippets.examples.javascript).toContain('https://mail.example.com/api/messages')
    expect(snippets.examples.python).toContain('https://mail.example.com/api/messages')
    expect(snippets.refreshToken).toContain('/api/auth/token/refresh')
    expect(snippets.revokeToken).toContain('/api/auth/token/revoke')
  })

  it('documents bearer authentication and optional MFA input', () => {
    const snippets = apiGuideSnippets('https://mail.example.com')

    expect(snippets.issueToken).toContain('"mfaCode": "123456"')
    expect(snippets.examples.curl).toContain('Authorization: Bearer om_at_...')
  })
})
