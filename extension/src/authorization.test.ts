import { describe, expect, it } from 'vitest'
import {
  authorizationCode,
  extensionAuthorizationUrl,
  pkceChallenge,
} from './authorization'

const clientId = 'abcdefghijklmnopabcdefghijklmnop'
const redirectUri = `https://${clientId}.chromiumapp.org/omnimail`
const state = 'a'.repeat(43)

describe('extension website authorization', () => {
  it('builds a PKCE authorization request', async () => {
    const challenge = await pkceChallenge(
      'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    )
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    const url = new URL(extensionAuthorizationUrl('https://mail.example.com', {
      clientId, redirectUri, state, codeChallenge: challenge,
    }))
    expect(url.pathname).toBe('/extension/authorize')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri)
  })

  it('accepts only a matching state and callback', () => {
    const code = `om_ac_${'b'.repeat(43)}`
    expect(authorizationCode(`${redirectUri}?code=${code}&state=${state}`, redirectUri, state))
      .toBe(code)
    expect(() => authorizationCode(
      `${redirectUri}?code=${code}&state=${'c'.repeat(43)}`,
      redirectUri,
      state,
    )).toThrow('状态校验失败')
    expect(() => authorizationCode(
      `https://attacker.example/callback?code=${code}&state=${state}`,
      redirectUri,
      state,
    )).toThrow('无效的授权回调')
  })

  it('reports user cancellation without accepting a code', () => {
    expect(() => authorizationCode(
      `${redirectUri}?error=access_denied&state=${state}`,
      redirectUri,
      state,
    )).toThrow('取消')
  })
})
