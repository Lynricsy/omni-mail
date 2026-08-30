import { publicSetupRequirements } from './deployment-check'
import {
  linuxDoAuthReady,
  parseRegistrationDomains,
  parseRegistrationMethod,
  type RegistrationDomainPolicy,
} from '../auth/registration/registration-api'
import { registrationProtectionReady } from '../auth/registration/registration-security'
import {
  parseMailRefreshInterval,
  parseRandomMailboxPrefix,
} from '../admin/settings/system-settings'
import { hasOutboundProviderConfig } from '../outbound/outbound-provider-config'
import type { Env } from '../../app/types'
import { iCloudCredentialsReady } from '../icloud/icloud-credentials'
import { gmailCredentialsReady } from '../gmail/gmail-credentials'
import { microsoftCredentialsReady } from '../microsoft/microsoft-credentials'
import { qqMailCredentialsReady } from '../qq-mail/qq-mail-credentials'
import { naverMailCredentialsReady } from '../naver-mail/naver-mail-credentials'
import { yandexMailCredentialsReady } from '../yandex-mail/yandex-mail-credentials'

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
      'unassigned_mail_enabled',
      'official_extension_enabled',
      'random_mailbox_prefix',
      'icloud_workspace_enabled',
      'linuxdo_mail_workspace_enabled',
      'gmail_workspace_enabled',
      'microsoft_workspace_enabled',
      'qq_mail_workspace_enabled',
      'naver_mail_workspace_enabled',
      'yandex_mail_workspace_enabled'
    )`,
  ).all<Setting>()
  const settings = new Map(results.map((row) => [row.key, row.value]))
  const registrationEnabled = settings.get('external_registration_enabled') === '1'
  const registrationMethod = parseRegistrationMethod(
    settings.get('external_registration_method'),
  ) || 'password'
  const linuxDoLoginEnabled = linuxDoAuthReady(env)
  const passwordRegistrationReady = registrationProtectionReady(env)
  const setupComplete = settings.get('setup_complete') === '1'

  return {
    appName: env.APP_NAME || 'OmniMail',
    setupComplete,
    replyEnabled: hasOutboundProviderConfig(env),
    iCloudEnabled: iCloudCredentialsReady(env),
    gmailEnabled: env.GMAIL_IMAP_ENABLED !== 'false' && gmailCredentialsReady(env),
    gmailWorkspaceEnabled: env.GMAIL_IMAP_ENABLED !== 'false'
      && settings.get('gmail_workspace_enabled') !== '0',
    microsoftEnabled: env.MICROSOFT_MAIL_ENABLED !== 'false'
      && microsoftCredentialsReady(env),
    microsoftWorkspaceEnabled: env.MICROSOFT_MAIL_ENABLED !== 'false'
      && settings.get('microsoft_workspace_enabled') !== '0',
    qqMailEnabled: env.QQ_MAIL_IMAP_ENABLED !== 'false' && qqMailCredentialsReady(env),
    qqMailWorkspaceEnabled: env.QQ_MAIL_IMAP_ENABLED !== 'false'
      && settings.get('qq_mail_workspace_enabled') !== '0',
    naverMailEnabled: env.NAVER_MAIL_IMAP_ENABLED === 'true'
      && naverMailCredentialsReady(env),
    naverMailWorkspaceEnabled: env.NAVER_MAIL_IMAP_ENABLED === 'true'
      && settings.get('naver_mail_workspace_enabled') === '1',
    yandexMailEnabled: env.YANDEX_MAIL_IMAP_ENABLED === 'true'
      && yandexMailCredentialsReady(env),
    yandexMailWorkspaceEnabled: env.YANDEX_MAIL_IMAP_ENABLED === 'true'
      && settings.get('yandex_mail_workspace_enabled') === '1',
    iCloudWorkspaceEnabled: settings.get('icloud_workspace_enabled') !== '0',
    linuxDoMailWorkspaceEnabled: settings.get('linuxdo_mail_workspace_enabled') !== '0',
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
    officialExtensionEnabled: settings.get('official_extension_enabled') === '1',
    randomMailboxPrefix: parseRandomMailboxPrefix(
      settings.get('random_mailbox_prefix') || '',
    ) ?? '',
    superAdminEmail: setupComplete ? '' : superAdminEmail(env),
    setupRequirements: publicSetupRequirements(env),
  }
}
