export type Folder = 'inbox' | 'starred' | 'drafts' | 'sent' | 'trash'

export interface AppConfig {
  appName: string
  setupComplete: boolean
  replyEnabled: boolean
  iCloudEnabled: boolean
  iCloudWorkspaceEnabled: boolean
  linuxDoMailWorkspaceEnabled: boolean
  gmailEnabled: boolean
  gmailWorkspaceEnabled: boolean
  microsoftEnabled: boolean
  microsoftWorkspaceEnabled: boolean
  qqMailEnabled: boolean
  qqMailWorkspaceEnabled: boolean
  naverMailEnabled: boolean
  naverMailWorkspaceEnabled: boolean
  yandexMailEnabled: boolean
  yandexMailWorkspaceEnabled: boolean
  registrationEnabled: boolean
  registrationAvailable: boolean
  registrationMethod: RegistrationMethod
  linuxDoLoginEnabled: boolean
  registrationDomainPolicy: RegistrationDomainPolicy
  registrationProtectionReady: boolean
  turnstileSiteKey: string
  mailRefreshInterval: MailRefreshInterval
  remoteImagesEnabled: boolean
  unassignedMailEnabled: boolean
  officialExtensionEnabled: boolean
  randomMailboxPrefix: string
  superAdminEmail: string
  setupRequirements: SetupRequirements
}

export interface SetupRequirements {
  databaseReady: boolean
  storageReady: boolean
  queueReady: boolean
  superAdminReady: boolean
  setupTokenReady: boolean
}

export type DeploymentCheckState = 'ready' | 'missing' | 'warning' | 'manual'

export interface DeploymentCheckItem {
  id: string
  group: 'core' | 'security' | 'mail'
  label: string
  state: DeploymentCheckState
  required: boolean
  detail: string
  action: string
}

export interface DeploymentCheck {
  generatedAt: number
  ready: boolean
  checks: DeploymentCheckItem[]
}

export interface SystemVersion {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  checkFailed: boolean
  checkedAt: number
  releaseUrl: string
  releaseRepository: string
}

export type RegistrationDomainPolicyMode = 'blocklist' | 'allowlist'
export type RegistrationMethod = 'password' | 'linuxdo'

export interface RegistrationDomainPolicy {
  mode: RegistrationDomainPolicyMode
  domains: string[]
}

export type MailRefreshInterval = 0 | 5 | 10 | 30 | 60 | 120
export type MailSyncLimit = 10 | 20 | 50

export type UserRole = 'super_admin' | 'admin' | 'user' | 'temporary'

export interface User {
  id: string
  email: string
  displayName: string
  role: UserRole
  mailboxLimit: number
  storageQuotaBytes: number
  storageUsedBytes: number
  canCreateMailboxes: boolean
  canReply: boolean
  canTranslate: boolean
  temporaryExpiresAt: number | null
}
