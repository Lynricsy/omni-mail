import { validEmail } from '../../shared/http/api-helpers'
import type { Env } from '../../app/types'

export type SendflareConfig = {
  apiKey: string
  from?: string
}

type DomainConfigs = {
  valid: boolean
  values: Map<string, SendflareConfig>
}

function domainConfigs(env: Env): DomainConfigs {
  const raw = env.SENDFLARE_DOMAIN_CONFIGS?.trim()
  if (!raw) return { valid: true, values: new Map() }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, values: new Map() }
    }
    const configs = new Map<string, SendflareConfig>()
    for (const [domain, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { valid: false, values: new Map() }
      }
      const normalizedDomain = domain.trim().toLowerCase()
      const candidate = value as { apiKey?: unknown; from?: unknown }
      const apiKey = typeof candidate.apiKey === 'string' ? candidate.apiKey.trim() : ''
      const from = typeof candidate.from === 'string' ? candidate.from.trim() : ''
      if (!normalizedDomain || !apiKey || (candidate.from !== undefined && typeof candidate.from !== 'string')
        || (from && !validEmail(from))) {
        return { valid: false, values: new Map() }
      }
      configs.set(normalizedDomain, { apiKey, from: from || undefined })
    }
    return { valid: true, values: configs }
  } catch {
    return { valid: false, values: new Map() }
  }
}

function addressDomain(address: string): string | null {
  const separator = address.lastIndexOf('@')
  return separator > 0 ? address.slice(separator + 1).trim().toLowerCase() : null
}

export function sendflareDomainConfigIsInvalid(env: Env): boolean {
  return !domainConfigs(env).valid
}

export function sendflareGlobalConfigIsInvalid(env: Env): boolean {
  const from = env.SENDFLARE_FROM?.trim()
  return Boolean(from && !validEmail(from))
}

export function sendflareDomainConfigForAddress(env: Env, address: string): SendflareConfig | null {
  const domain = addressDomain(address)
  if (!domain) return null
  const parsed = domainConfigs(env)
  return parsed.valid ? parsed.values.get(domain) ?? null : null
}

export function sendflareGlobalConfig(env: Env): SendflareConfig | null {
  if (sendflareGlobalConfigIsInvalid(env)) return null
  const apiKey = env.SENDFLARE_API_KEY?.trim()
  if (!apiKey) return null
  const from = env.SENDFLARE_FROM?.trim()
  return { apiKey, from: from || undefined }
}

export function hasSendflareConfig(env: Env): boolean {
  const parsed = domainConfigs(env)
  return parsed.valid && !sendflareGlobalConfigIsInvalid(env)
    && (Boolean(env.SENDFLARE_API_KEY?.trim()) || parsed.values.size > 0)
}
