import { publicSetupRequirements } from './deployment-check'
import {
  linuxDoAuthReady,
  parseRegistrationDomains,
  parseRegistrationMethod,
  type RegistrationDomainPolicy,
} from './registration-api'
import { registrationProtectionReady } from './registration-security'
import {
  parseMailRefreshInterval,
} from './system-settings'
import { hasOutboundProviderConfig } from './outbound-provider-config'
import type { Env } from './types'

type Setting = { key: string; value: string }

function domainPolicy(settings: Map<string, string>): RegistrationDomainPolicy {
  const mode = settings.get('registration_domain_policy_mode') === 'allowlist'
    ? 'allowlist'
    : 'blocklist'
  try {
    const domains = parseRegistrationDomains(
      JSON.parse(settings.get('registration_blocked_domains') || '[]'),
    ) ?? []
    return { mode, domains }
  } catch {
    return { mode, domains: [] }
  }
}

function superAdminEmail(env: Env): string {
  const email = (env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

export async function publicConfig(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN (
      'setup_complete',
      'external_registration_enabled',
      'external_registration_method',
      'registration_domain_policy_mode',
      'registration_blocked_domains',
      'mail_refresh_interval',
      'remote_images_enabled',
      'unassigned_mail_enabled'
    )`,
  ).all<Setting>()
  const settings = new Map(results.map((row) => [row.key, row.value]))
  const registrationEnabled = settings.get('external_registration_enabled') === '1'
  const registrationMethod = parseRegistrationMethod(
    settings.get('external_registration_method'),
  ) || 'password'
  const linuxDoLoginEnabled = linuxDoAuthReady(env)
  const passwordRegistrationReady = registrationProtectionReady(env)

  return {
    appName: env.APP_NAME || 'OmniMail',
    setupComplete: settings.get('setup_complete') === '1',
    replyEnabled: hasOutboundProviderConfig(env),
    registrationEnabled,
    registrationAvailable: registrationEnabled && (
      registrationMethod === 'linuxdo' ? linuxDoLoginEnabled : passwordRegistrationReady
    ),
    registrationMethod,
    linuxDoLoginEnabled,
    registrationDomainPolicy: domainPolicy(settings),
    registrationProtectionReady: passwordRegistrationReady,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY?.trim() || '',
    mailRefreshInterval: parseMailRefreshInterval(
      Number(settings.get('mail_refresh_interval')),
    ) ?? 30,
    remoteImagesEnabled: settings.get('remote_images_enabled') === '1',
    unassignedMailEnabled: settings.get('unassigned_mail_enabled') === '1',
    superAdminEmail: superAdminEmail(env),
    setupRequirements: publicSetupRequirements(env),
  }
}
