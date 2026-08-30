import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginLinuxDoAuth,
  finishLinuxDoAuth,
  parseLinuxDoProfile,
} from './linux-do-auth'
import type { Env } from '../../app/types'

type Statement = {
  sql: string
  bindings: unknown[]
  bind: (...values: unknown[]) => Statement
  first: <T>() => Promise<T | null>
  all: <T>() => Promise<{ results: T[] }>
  run: () => Promise<{ meta: { changes: number } }>
}

function testEnvironment(options: {
  method?: 'password' | 'linuxdo'
  enabled?: boolean
  existing?: boolean
} = {}) {
  const statements: Statement[] = []
  let identityCreated = options.existing || false
  const linked = {
    id: 'user-1',
    email: 'linuxdo-1189@oauth.omnimail.invalid',
    display_name: 'Reno',
    role: 'user',
    status: 'active',
    mailbox_limit: 1,
    storage_quota_bytes: 1024 ** 3,
    storage_used_bytes: 0,
    can_create_mailboxes: 1,
    can_reply: 0,
    can_translate: 1,
    temporary_expires_at: null,
    deleted_at: null,
  }
  const prepare = (sql: string): Statement => {
    const statement: Statement = {
      sql,
      bindings: [],
      bind(...values) {
        this.bindings = values
        return this
      },
      async first<T>() {
        if (sql.includes('FROM oauth_states')) {
          return { return_origin: 'https://app.example' } as T
        }
        if (sql.includes('FROM oauth_identities')) {
          return (identityCreated ? linked : null) as T | null
        }
        if (sql.includes('FROM settings WHERE key = ?')) {
          const key = this.bindings[0]
          if (key === 'external_registration_enabled') {
            return { value: options.enabled === false ? '0' : '1' } as T
          }
          if (key === 'external_registration_method') {
            return { value: options.method || 'linuxdo' } as T
          }
        }
        return null
      },
      async all<T>() {
        return { results: [] as T[] }
      },
      async run() {
        return { meta: { changes: 1 } }
      },
    }
    statements.push(statement)
    return statement
  }
  const batch = vi.fn(async (batchStatements: Statement[]) => {
    if (batchStatements.some(({ sql }) => sql.includes('INSERT INTO users'))) {
      identityCreated = true
    }
    return batchStatements.map(() => ({ success: true, meta: { changes: 1 } }))
  })
  return {
    env: {
      DB: { prepare, batch },
      LINUX_DO_CLIENT_ID: 'client-id',
      LINUX_DO_CLIENT_SECRET: 'client-secret',
      APP_ORIGINS: 'https://app.example',
    } as unknown as Env,
    batch,
    statements,
  }
}

afterEach(() => vi.unstubAllGlobals())

const validState = 'valid_state_12345678901234567890'

function oauthStateCookie(state = validState, returnTo = 'https://app.example'): string {
  const origin = btoa(returnTo)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
  return `${state}.${origin}.${Math.floor(Date.now() / 1000) + 600}`
}

describe('Linux DO profile validation', () => {
  it('uses the immutable numeric id and normalizes profile metadata', () => {
    expect(parseLinuxDoProfile({
      id: 1189,
      username: 'Reno',
      name: '',
      avatar_template: 'https://linux.do/avatar/{size}.png',
      active: true,
    })).toEqual({
      subject: '1189',
      username: 'Reno',
      displayName: 'Reno',
      avatarUrl: 'https://linux.do/avatar/120.png',
    })
  })

  it('rejects inactive users and malformed immutable ids', () => {
    expect(parseLinuxDoProfile({ id: 1, username: 'reno', active: false })).toBeNull()
    expect(parseLinuxDoProfile({ id: 'not-an-id', username: 'reno', active: true })).toBeNull()
  })
})

describe('Linux DO OAuth flow', () => {
  it('returns a short-lived browser state and redirects only to the configured provider', async () => {
    const { env } = testEnvironment()
    const result = await beginLinuxDoAuth(
      env,
      new Request('https://mail.example/api/auth/linux-do?returnTo=https://app.example'),
    )
    const response = result.response
    const authorization = new URL(response.headers.get('Location') || '')
    const state = authorization.searchParams.get('state') || ''
    expect(response.status).toBe(302)
    expect(authorization.origin).toBe('https://connect.linux.do')
    expect(authorization.pathname).toBe('/oauth2/authorize')
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      'https://mail.example/api/auth/linux-do/callback',
    )
    expect(result.stateCookie).toContain(state)
    expect(result.stateCookie).toContain(
      btoa('https://app.example').replaceAll('=', ''),
    )
  })

  it('does not retain an unapproved post-login origin', async () => {
    const { env } = testEnvironment()
    const result = await beginLinuxDoAuth(
      env,
      new Request('https://mail.example/api/auth/linux-do?returnTo=https://evil.example'),
    )
    expect(result.stateCookie).toContain(
      btoa('https://mail.example').replaceAll('=', ''),
    )
    expect(result.stateCookie).not.toContain(
      btoa('https://evil.example').replaceAll('=', ''),
    )
  })

  it('preserves an approved same-origin authorization path through the callback', async () => {
    const { env } = testEnvironment({ existing: true })
    const returnTo = 'https://mail.example/extension/authorize?client_id=example'
    const started = await beginLinuxDoAuth(
      env,
      new Request(`https://mail.example/api/auth/linux-do?returnTo=${encodeURIComponent(returnTo)}`),
    )
    expect(started.stateCookie).toContain(
      btoa(returnTo).replaceAll('=', ''),
    )
    const state = new URL(started.response.headers.get('Location') || '')
      .searchParams.get('state') || ''
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: 'token' }))
      .mockResolvedValueOnce(Response.json({
        id: 1189,
        username: 'Reno',
        active: true,
      })))
    const finished = await finishLinuxDoAuth(
      env,
      new Request(`https://mail.example/api/auth/linux-do/callback?state=${state}&code=code-1`),
      '127.0.0.1',
      started.stateCookie,
    )
    expect(finished.response.headers.get('Location')).toBe(returnTo)
  })

  it('creates an OAuth-only user without persisting the provider token', async () => {
    const { env, statements } = testEnvironment()
    const provider = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: 'provider-secret-token' }))
      .mockResolvedValueOnce(Response.json({
        id: 1189,
        username: 'Reno',
        name: '',
        active: true,
      }))
    vi.stubGlobal('fetch', provider)
    const result = await finishLinuxDoAuth(
      env,
      new Request(`https://mail.example/api/auth/linux-do/callback?state=${validState}&code=code-1`),
      '127.0.0.1',
      oauthStateCookie(),
    )
    expect(result.response.status).toBe(302)
    expect(result.response.headers.get('Location')).toBe('https://app.example/')
    expect(result.sessionToken).toBeTruthy()
    expect(provider).toHaveBeenCalledTimes(2)
    const userInsert = statements.find(({ sql }) => sql.includes('INSERT INTO users'))
    expect(userInsert?.bindings).toContain('linuxdo-1189@oauth.omnimail.invalid')
    expect(userInsert?.sql).toContain("'active', 1, ?, 1, 0")
    expect(JSON.stringify(statements)).not.toContain('provider-secret-token')
  })

  it('falls back to the provider server endpoints when the primary host rejects a request', async () => {
    const { env } = testEnvironment({ existing: true })
    const provider = vi.fn()
      .mockResolvedValueOnce(Response.json({}, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ access_token: 'token' }))
      .mockResolvedValueOnce(Response.json({}, { status: 403 }))
      .mockResolvedValueOnce(Response.json({
        id: 1189,
        username: 'Reno',
        active: true,
      }))
    vi.stubGlobal('fetch', provider)
    const result = await finishLinuxDoAuth(
      env,
      new Request(`https://mail.example/api/auth/linux-do/callback?state=${validState}&code=code-1`),
      '127.0.0.1',
      oauthStateCookie(),
    )
    expect(result.sessionToken).toBeTruthy()
    expect(provider.mock.calls[1]?.[0]).toBe('https://connect.linuxdo.org/oauth2/token')
    expect(provider.mock.calls[3]?.[0]).toBe('https://connect.linuxdo.org/api/user')
  })

  it('does not create a new identity when password registration is selected', async () => {
    const { env, statements } = testEnvironment({ method: 'password' })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: 'token' }))
      .mockResolvedValueOnce(Response.json({
        id: 1189,
        username: 'Reno',
        active: true,
      })))
    const result = await finishLinuxDoAuth(
      env,
      new Request(`https://mail.example/api/auth/linux-do/callback?state=${validState}&code=code-1`),
      '127.0.0.1',
      oauthStateCookie(),
    )
    expect(result.sessionToken).toBeUndefined()
    expect(result.response.headers.get('Location')).toBe(
      'https://app.example/?auth_error=linuxdo',
    )
    expect(statements.some(({ sql }) => sql.includes('INSERT INTO users'))).toBe(false)
  })

  it('allows an existing linked identity to sign in after registration closes', async () => {
    const { env } = testEnvironment({ existing: true, enabled: false })
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: 'token' }))
      .mockResolvedValueOnce(Response.json({
        id: 1189,
        username: 'Reno',
        active: true,
      })))
    const result = await finishLinuxDoAuth(
      env,
      new Request(`https://mail.example/api/auth/linux-do/callback?state=${validState}&code=code-1`),
      '127.0.0.1',
      oauthStateCookie(),
    )
    expect(result.sessionToken).toBeTruthy()
    expect(result.response.headers.get('Location')).toBe('https://app.example/')
  })

  it('rejects an invalid state before contacting the provider', async () => {
    const { env } = testEnvironment()
    const provider = vi.fn()
    vi.stubGlobal('fetch', provider)
    const result = await finishLinuxDoAuth(
      env,
      new Request('https://mail.example/api/auth/linux-do/callback?state=short&code=code-1'),
      '127.0.0.1',
      oauthStateCookie(),
    )
    expect(result.sessionToken).toBeUndefined()
    expect(provider).not.toHaveBeenCalled()
  })
})
