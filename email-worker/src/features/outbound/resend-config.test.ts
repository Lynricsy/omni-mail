import { describe, expect, it } from 'vitest'
import {
  hasResendConfig,
  resendConfigForAddress,
  resendDomainConfigIsInvalid,
} from './resend-config'
import type { Env } from '../../app/types'

describe('Resend configuration', () => {
  it('selects the API key for each configured domain', () => {
    const env = {
      RESEND_DOMAIN_CONFIGS: JSON.stringify({
        'example.com': {
          apikey: ' re_domain ',
          from: 'Example <reply@example.com>',
        },
        'another.example': { apiKey: 're_another' },
      }),
    } as Env

    expect(resendConfigForAddress(env, 'Owner@Example.COM')).toEqual({
      apiKey: 're_domain',
      from: 'Example <reply@example.com>',
    })
    expect(resendConfigForAddress(env, 'owner@other.example')).toBeNull()
    expect(resendConfigForAddress(env, 'owner@another.example')).toEqual({
      apiKey: 're_another',
      from: undefined,
    })
  })

  it('uses the mailbox sender when a domain configuration omits from', () => {
    const env = {
      RESEND_DOMAIN_CONFIGS: JSON.stringify({
        'example.com': { apiKey: 're_domain' },
      }),
    } as Env

    expect(hasResendConfig(env)).toBe(true)
    expect(resendConfigForAddress(env, 'owner@example.com')).toEqual({
      apiKey: 're_domain',
      from: undefined,
    })
    expect(resendConfigForAddress(env, 'owner@other.example')).toBeNull()
    expect(resendConfigForAddress(env, 'not-an-address')).toBeNull()
  })

  it('rejects malformed domain configuration', () => {
    const env = {
      RESEND_DOMAIN_CONFIGS: '{invalid',
    } as Env

    expect(resendDomainConfigIsInvalid(env)).toBe(true)
    expect(hasResendConfig(env)).toBe(false)
    expect(resendConfigForAddress(env, 'owner@example.com')).toBeNull()
  })

  it('rejects a domain entry without an apiKey field', () => {
    const env = {
      RESEND_DOMAIN_CONFIGS: JSON.stringify({
        'example.com': { apiKey: 're_example' },
        'other.example': { value: 're_other' },
      }),
    } as Env

    expect(resendDomainConfigIsInvalid(env)).toBe(true)
    expect(resendConfigForAddress(env, 'owner@example.com')).toBeNull()
  })
})
