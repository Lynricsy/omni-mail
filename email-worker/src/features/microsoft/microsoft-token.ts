const IMAP_SCOPE = 'https://outlook.office.com/IMAP.AccessAsUser.All'
export const MICROSOFT_TOKEN_SCOPE = `${IMAP_SCOPE} offline_access`
const NAMED_AUTHORITIES = new Set(['common', 'consumers', 'organizations'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class MicrosoftTokenError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly status = 400,
  ) {
    super(`Microsoft token refresh failed (${code}).`)
    this.name = 'MicrosoftTokenError'
  }
}

export function validateMicrosoftAuthority(value: string): string {
  const authority = value.trim().toLowerCase()
  if (!NAMED_AUTHORITIES.has(authority) && !UUID.test(authority)) {
    throw new Error('Invalid Microsoft authority')
  }
  return authority
}

export function microsoftTokenEndpoint(authority: string): string {
  return `https://login.microsoftonline.com/${validateMicrosoftAuthority(authority)}/oauth2/v2.0/token`
}

function providerErrorCode(value: unknown, status: number): MicrosoftTokenError {
  const code = typeof value === 'string' && /^[a-z0-9_.-]{1,80}$/i.test(value)
    ? value.toLowerCase() : 'token_refresh_failed'
  const retryable = status === 429 || status >= 500
  return new MicrosoftTokenError(code, retryable, retryable ? 503 : 400)
}

export async function refreshMicrosoftToken({
  authority,
  clientId,
  refreshToken,
  fetcher = fetch,
}: {
  authority: string
  clientId: string
  refreshToken: string
  fetcher?: typeof fetch
}): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
  scope: string
}> {
  let response: Response
  try {
    response = await fetcher(microsoftTokenEndpoint(authority), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: MICROSOFT_TOKEN_SCOPE,
      }),
    })
  } catch {
    throw new MicrosoftTokenError('token_endpoint_unavailable', true, 503)
  }

  let body: Record<string, unknown>
  try {
    const parsed = await response.json<unknown>()
    body = parsed && !Array.isArray(parsed) && typeof parsed === 'object'
      ? parsed as Record<string, unknown> : {}
  } catch {
    body = {}
  }
  if (!response.ok) throw providerErrorCode(body.error, response.status)

  const accessToken = typeof body.access_token === 'string' ? body.access_token : ''
  const rotated = typeof body.refresh_token === 'string' ? body.refresh_token : refreshToken
  const expiresIn = Number(body.expires_in)
  const scope = typeof body.scope === 'string' ? body.scope : ''
  if (!accessToken || !Number.isSafeInteger(expiresIn) || expiresIn < 1) {
    throw new MicrosoftTokenError('invalid_token_response', false, 502)
  }
  if (scope && !scope.split(/\s+/).some((item) => item.toLowerCase() === IMAP_SCOPE.toLowerCase())) {
    throw new MicrosoftTokenError('imap_scope_missing', false, 403)
  }
  return { accessToken, refreshToken: rotated, expiresIn, scope }
}
