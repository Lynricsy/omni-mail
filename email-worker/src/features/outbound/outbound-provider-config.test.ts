import { describe, expect, it } from 'vitest'
import {
  hasOutboundProviderConfig,
  outboundProviderConfigError,
  outboundProviderForAddress,
} from './outbound-provider-config'
import type { Env } from '../../app/types'

describe('outbound provider configuration', () => {
  it('uses a domain-specific SendFlare account before existing Resend configuration', () => {
    const env = {
      RESEND_DOMAIN_CONFIGS: JSON.stringify({
        'other.example': { apiKey: 're_other' },
      }),
      SENDFLARE_DOMAIN_CONFIGS: JSON.stringify({
        ' Example.com ': { apiKey: ' sf_domain ', from: 'sender@example.com' },
      }),
    } as Env

    expect(outboundProviderForAddress(env, 'owner@EXAMPLE.COM')).toEqual({
      provider: 'sendflare', apiKey: 'sf_domain', from: 'sender@example.com',
    })
    expect(outboundProviderForAddress(env, 'owner@other.example')).toEqual({
      provider: 'resend', apiKey: 're_other', from: undefined,
    })
  })

  it('supports SendFlare as the global provider when Resend is absent', () => {
    const env = { SENDFLARE_API_KEY: 'sf_global' } as Env
    expect(hasOutboundProviderConfig(env)).toBe(true)
    expect(outboundProviderForAddress(env, 'owner@example.com')).toEqual({
      provider: 'sendflare', apiKey: 'sf_global', from: undefined,
    })
  })

  it('rejects malformed SendFlare domain configuration', () => {
    const env = {
      RESEND_DOMAIN_CONFIGS: JSON.stringify({
        'example.com': { apiKey: 're_example' },
      }),
      SENDFLARE_DOMAIN_CONFIGS: '{invalid',
    } as Env
    expect(outboundProviderConfigError(env)).toBe('SENDFLARE_DOMAIN_CONFIGS 格式无效。')
    expect(hasOutboundProviderConfig(env)).toBe(false)
    expect(outboundProviderForAddress(env, 'owner@example.com')).toBeNull()
  })

  it('rejects a SendFlare display-name sender', () => {
    const env = {
      SENDFLARE_API_KEY: 'sf_global',
      SENDFLARE_FROM: 'OmniMail <reply@example.com>',
    } as Env
    expect(outboundProviderConfigError(env)).toBe('SENDFLARE_FROM 必须是有效邮箱地址。')
    expect(outboundProviderForAddress(env, 'owner@example.com')).toBeNull()
  })
})
