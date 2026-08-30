function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return btoa(String.fromCharCode(...value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

export function randomAuthorizationValue(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return base64Url(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  ))
}

export function extensionAuthorizationUrl(
  apiOrigin: string,
  input: {
    clientId: string
    redirectUri: string
    state: string
    codeChallenge: string
  },
): string {
  const url = new URL('/extension/authorize', apiOrigin)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export function authorizationCode(
  callbackValue: string | undefined,
  redirectUri: string,
  expectedState: string,
): string {
  if (!callbackValue) throw new Error('授权窗口已关闭或授权未完成。')
  const callback = new URL(callbackValue)
  const expected = new URL(redirectUri)
  if (callback.origin !== expected.origin || callback.pathname !== expected.pathname) {
    throw new Error('OmniMail 返回了无效的授权回调。')
  }
  if (callback.searchParams.get('state') !== expectedState) {
    throw new Error('OmniMail 授权状态校验失败，请重试。')
  }
  if (callback.searchParams.get('error') === 'access_denied') {
    throw new Error('你已取消 OmniMail 授权。')
  }
  if (callback.searchParams.has('error')) {
    throw new Error('OmniMail 未能完成授权。')
  }
  const code = callback.searchParams.get('code') || ''
  if (!/^om_ac_[A-Za-z0-9_-]{32,154}$/.test(code)) {
    throw new Error('OmniMail 返回的授权码无效。')
  }
  return code
}
