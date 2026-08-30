import type { RegistrationDomainPolicy } from '../../../shared/api'

export function registrationDomainsFromText(value: string): string[] {
  return [...new Set(
    value
      .split(/[\s,，;；]+/)
      .map((item) => item.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  )]
}

function emailMatchesDomainList(email: string, domains: string[]): boolean {
  const domain = email.trim().toLowerCase().split('@').at(-1) || ''
  return domains.some((listed) => (
    domain === listed || domain.endsWith(`.${listed}`)
  ))
}

export function emailAllowedByDomainPolicy(
  email: string,
  policy: RegistrationDomainPolicy,
): boolean {
  const matches = emailMatchesDomainList(email, policy.domains)
  return policy.mode === 'allowlist' ? matches : !matches
}
