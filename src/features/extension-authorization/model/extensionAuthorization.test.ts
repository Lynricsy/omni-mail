import { describe, expect, it } from 'vitest'
import {
  extensionAuthorizationRequest,
  extensionAuthorizationResult,
} from './extensionAuthorization'

const clientId = 'abcdefghijklmnopabcdefghijklmnop'
const redirectUri = `https://${clientId}.chromiumapp.org/omnimail`
const state = 'a'.repeat(43)
const challenge = 'b'.repeat(43)

function authorizationUrl(overrides: Record<string, string> = {}): string {
  const url = new URL('https://mail.example.com/extension/authorize')
  const values = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...overrides,
  }
  Object.entries(values).forEach(([key, value]) => url.searchParams.set(key, value))
  return url.toString()
}

describe('extension authorization URL', () => {
  it('parses an exact Chrome Identity authorization request', () => {
    expect(extensionAuthorizationRequest(authorizationUrl())).toEqual({
      clientId,
      redirectUri,
      state,
      codeChallenge: challenge,
    })
  })

  it('rejects a callback that is not bound to the client id', () => {
    expect(extensionAuthorizationRequest(authorizationUrl({
      redirect_uri: 'https://attacker.example/callback',
    }))).toBeNull()
  })

  it('returns errors to the callback without exposing a token', () => {
    const request = extensionAuthorizationRequest(authorizationUrl())!
    expect(extensionAuthorizationResult(request, { error: 'access_denied' }))
      .toBe(`${redirectUri}?state=${state}&error=access_denied`)
  })
})
