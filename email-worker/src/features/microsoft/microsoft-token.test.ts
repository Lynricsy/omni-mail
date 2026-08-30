import { describe, expect, it, vi } from 'vitest'
import {
  MicrosoftTokenError,
  microsoftTokenEndpoint,
  refreshMicrosoftToken,
  validateMicrosoftAuthority,
} from './microsoft-token'

describe('Microsoft OAuth token refresh', () => {
  it('uses only the fixed Azure Global token endpoint and Outlook IMAP scope', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body))
      expect(body.get('client_id')).toBe('00000000-0000-4000-8000-000000000000')
      expect(body.get('refresh_token')).toBe('refresh-token')
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('scope')).toBe(
        'https://outlook.office.com/IMAP.AccessAsUser.All offline_access',
      )
      return Response.json({
        token_type: 'Bearer',
        access_token: 'access-token',
        refresh_token: 'rotated-token',
        expires_in: 3600,
        scope: 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access',
      })
    })

    await expect(refreshMicrosoftToken({
      authority: 'consumers',
      clientId: '00000000-0000-4000-8000-000000000000',
      refreshToken: 'refresh-token',
      fetcher,
    })).resolves.toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'rotated-token',
      expiresIn: 3600,
    })
    expect(fetcher).toHaveBeenCalledWith(
      microsoftTokenEndpoint('consumers'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('accepts named authorities and tenant UUIDs but rejects URL injection', () => {
    expect(validateMicrosoftAuthority('common')).toBe('common')
    expect(validateMicrosoftAuthority('organizations')).toBe('organizations')
    expect(validateMicrosoftAuthority('00000000-0000-4000-8000-000000000000'))
      .toBe('00000000-0000-4000-8000-000000000000')
    expect(() => validateMicrosoftAuthority('https://evil.example/token')).toThrow('authority')
  })

  it('maps invalid_grant without returning the provider description or token', async () => {
    const fetcher = vi.fn(async () => Response.json({
      error: 'invalid_grant',
      error_description: 'refresh-token must never leave the server log boundary',
    }, { status: 400 }))
    const error = await refreshMicrosoftToken({
      authority: 'common',
      clientId: '00000000-0000-4000-8000-000000000000',
      refreshToken: 'refresh-token',
      fetcher,
    }).catch((caught) => caught)
    expect(error).toBeInstanceOf(MicrosoftTokenError)
    expect(error).toMatchObject({ code: 'invalid_grant', retryable: false })
    expect(String(error)).not.toContain('refresh-token')
  })
})
