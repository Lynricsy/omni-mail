export interface ExtensionAuthorizationRequest {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
}

const clientIdPattern = /^[a-p]{32}$/
const statePattern = /^[A-Za-z0-9_-]{32,128}$/
const challengePattern = /^[A-Za-z0-9_-]{43}$/

export function extensionAuthorizationRequest(
  value = window.location.href,
): ExtensionAuthorizationRequest | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.pathname !== '/extension/authorize') return null
  const clientId = url.searchParams.get('client_id') || ''
  const redirectUri = url.searchParams.get('redirect_uri') || ''
  const state = url.searchParams.get('state') || ''
  const codeChallenge = url.searchParams.get('code_challenge') || ''
  if (
    url.searchParams.get('response_type') !== 'code'
    || url.searchParams.get('code_challenge_method') !== 'S256'
    || !clientIdPattern.test(clientId)
    || redirectUri !== `https://${clientId}.chromiumapp.org/omnimail`
    || !statePattern.test(state)
    || !challengePattern.test(codeChallenge)
  ) return null
  return { clientId, redirectUri, state, codeChallenge }
}

export function extensionAuthorizationResult(
  request: ExtensionAuthorizationRequest,
  result: { code?: string; error?: string },
): string {
  const redirect = new URL(request.redirectUri)
  redirect.searchParams.set('state', request.state)
  if (result.code) redirect.searchParams.set('code', result.code)
  if (result.error) redirect.searchParams.set('error', result.error)
  return redirect.toString()
}
