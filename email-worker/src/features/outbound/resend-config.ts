import type { Env } from '../../app/types'

export type ResendConfig = {
  apiKey: string
  from?: string
}

type DomainConfigs = {
  valid: boolean
  values: Map<string, ResendConfig>
}

function domainConfigs(env: Env): DomainConfigs {
  const raw = env.RESEND_DOMAIN_CONFIGS?.trim()
  if (!raw) return { valid: true, values: new Map() }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, values: new Map() }
    }
    const configs = new Map<string, ResendConfig>()
    for (const [domain, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { valid: false, values: new Map() }
      }
      const normalizedDomain = domain.trim().toLowerCase()
      const candidate = value as { apiKey?: unknown; apikey?: unknown; from?: unknown }
      const configuredApiKey = candidate.apiKey ?? candidate.apikey
      const apiKey = typeof configuredApiKey === 'string' ? configuredApiKey.trim() : ''
      const from = typeof candidate.from === 'string' ? candidate.from.trim() : ''
      if (!normalizedDomain || !apiKey || (candidate.from !== undefined && typeof candidate.from !== 'string')) {
        return { valid: false, values: new Map() }
      }
      configs.set(normalizedDomain, { apiKey, from: from || undefined })
    }
    return { valid: true, values: configs }
  } catch {
    return { valid: false, values: new Map() }
  }
}

export function resendDomainConfigIsInvalid(env: Env): boolean {
  return !domainConfigs(env).valid
}

export function resendConfigForAddress(env: Env, address: string): ResendConfig | null {
  const separator = address.lastIndexOf('@')
  if (separator <= 0) return null
  const domain = address.slice(separator + 1).trim().toLowerCase()
  const parsed = domainConfigs(env)
  if (!parsed.valid) return null
  return parsed.values.get(domain) ?? null
}

export function hasResendConfig(env: Env): boolean {
  const parsed = domainConfigs(env)
  return parsed.valid && parsed.values.size > 0
}
