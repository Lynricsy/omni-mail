import { hasResendConfig, resendConfigForAddress, resendDomainConfigIsInvalid } from './resend-config'
import {
  hasSendflareConfig,
  sendflareDomainConfigForAddress,
  sendflareDomainConfigIsInvalid,
  sendflareGlobalConfig,
  sendflareGlobalConfigIsInvalid,
} from './sendflare-config'
import type { Env } from '../../app/types'

export type OutboundProviderConfig = {
  provider: 'resend' | 'sendflare'
  apiKey: string
  from?: string
}

export function outboundProviderConfigError(env: Env): string | null {
  if (resendDomainConfigIsInvalid(env)) return 'RESEND_DOMAIN_CONFIGS 格式无效。'
  if (sendflareDomainConfigIsInvalid(env)) return 'SENDFLARE_DOMAIN_CONFIGS 格式无效。'
  if (sendflareGlobalConfigIsInvalid(env)) return 'SENDFLARE_FROM 必须是有效邮箱地址。'
  return null
}

export function outboundProviderForAddress(env: Env, address: string): OutboundProviderConfig | null {
  if (outboundProviderConfigError(env)) return null
  const sendflareDomain = sendflareDomainConfigForAddress(env, address)
  if (sendflareDomain) return { provider: 'sendflare', ...sendflareDomain }
  const resend = resendConfigForAddress(env, address)
  if (resend) return { provider: 'resend', ...resend }
  const sendflareGlobal = sendflareGlobalConfig(env)
  return sendflareGlobal ? { provider: 'sendflare', ...sendflareGlobal } : null
}

export function hasOutboundProviderConfig(env: Env): boolean {
  return !outboundProviderConfigError(env) && (hasResendConfig(env) || hasSendflareConfig(env))
}
