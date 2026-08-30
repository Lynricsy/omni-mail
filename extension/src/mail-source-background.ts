import type {
  AppConfig,
  GmailAccount,
  GmailMessageDetail,
  GmailMessageSummary,
  ICloudAccount,
  LinuxDoMailAccount,
  LinuxDoMailMessage,
  MicrosoftAccount,
  MicrosoftMessageDetail,
  MicrosoftMessageSummary,
  NaverMailAccount,
  NaverMailMessageDetail,
  NaverMailMessageSummary,
  QqMailAccount,
  QqMailMessageDetail,
  QqMailMessageSummary,
  YandexMailAccount,
  YandexMailMessageDetail,
  YandexMailMessageSummary,
} from '../../src/shared/api/api-types'
import {
  getIndexedSourceAdapter,
  INDEXED_SOURCE_IDS,
  type IndexedMailSourceId,
  type IndexedMessageDetail,
  type IndexedMessageSummary,
  type MailSourceDescriptor,
  type MailSourceId,
  normalizeIndexedAccounts,
  normalizeIndexedMessage,
  normalizeIndexedMessageDetail,
} from './mail-source'

type AuthenticatedRequest = (path: string, init?: RequestInit) => Promise<unknown>

export const INDEXED_SOURCE_SCOPES = [
  'gmail:accounts:read',
  'gmail:messages:read',
  'qq-mail:accounts:read',
  'qq-mail:messages:read',
  'microsoft:accounts:read',
  'microsoft:messages:read',
  'naver-mail:accounts:read',
  'naver-mail:messages:read',
  'yandex-mail:accounts:read',
  'yandex-mail:messages:read',
  'linuxdo-mail:account:read',
  'linuxdo-mail:messages:read',
] as const

export const LINUX_DO_SOURCE_SCOPES = [
  'linuxdo-mail:account:read', 'linuxdo-mail:messages:read',
] as const

const SOURCE_SCOPES: Record<IndexedMailSourceId, readonly string[]> = {
  gmail: ['gmail:accounts:read', 'gmail:messages:read'],
  microsoft: ['microsoft:accounts:read', 'microsoft:messages:read'],
  qq: ['qq-mail:accounts:read', 'qq-mail:messages:read'],
  naver: ['naver-mail:accounts:read', 'naver-mail:messages:read'],
  yandex: ['yandex-mail:accounts:read', 'yandex-mail:messages:read'],
  linuxdo: ['linuxdo-mail:account:read', 'linuxdo-mail:messages:read'],
}

export function hasIndexedSourceScopes(scopes: string[] | undefined): boolean {
  return INDEXED_SOURCE_SCOPES.every((scope) => scopes?.includes(scope))
}

function hasSourceScopes(
  scopes: string[] | undefined,
  source: IndexedMailSourceId,
): boolean {
  return SOURCE_SCOPES[source].every((scope) => scopes?.includes(scope))
}

function sourceEnabled(config: AppConfig, source: IndexedMailSourceId): boolean {
  switch (source) {
    case 'gmail': return config.gmailEnabled && config.gmailWorkspaceEnabled
    case 'microsoft': return config.microsoftEnabled && config.microsoftWorkspaceEnabled
    case 'qq': return config.qqMailEnabled && config.qqMailWorkspaceEnabled
    case 'naver': return config.naverMailEnabled && config.naverMailWorkspaceEnabled
    case 'yandex': return config.yandexMailEnabled && config.yandexMailWorkspaceEnabled
    case 'linuxdo': return config.linuxDoMailWorkspaceEnabled
  }
}

function iCloudAccounts(accounts: ICloudAccount[]): MailSourceDescriptor {
  return {
    id: 'icloud',
    label: 'iCloud',
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      email: account.realEmail || account.icloudEmail || account.host,
      status: account.status === 'pending'
        ? 'syncing'
        : account.status === 'active' ? 'active' : 'error',
      needsAttention: account.status === 'error',
    })),
  }
}

type AccountResult = { accounts: Array<
  GmailAccount | MicrosoftAccount | QqMailAccount | NaverMailAccount | YandexMailAccount
> }

export async function discoverMailSources(
  request: AuthenticatedRequest,
  config: AppConfig,
  scopes: string[] | undefined,
): Promise<{
  sources: MailSourceDescriptor[]
  upgradeRequired: boolean
  unavailable: MailSourceId[]
}> {
  const sources: MailSourceDescriptor[] = [{ id: 'omnimail', label: 'OmniMail', accounts: [] }]
  const unavailable: MailSourceId[] = []
  const tasks: Array<{
    id: MailSourceId
    load: () => Promise<MailSourceDescriptor | null>
  }> = []

  if (config.iCloudEnabled && config.iCloudWorkspaceEnabled) {
    tasks.push({
      id: 'icloud',
      load: async () => {
        const result = await request('/api/icloud/accounts') as { accounts: ICloudAccount[] }
        return result.accounts.length ? iCloudAccounts(result.accounts) : null
      },
    })
  }

  for (const id of INDEXED_SOURCE_IDS) {
    if (!sourceEnabled(config, id) || !hasSourceScopes(scopes, id)) continue
    const adapter = getIndexedSourceAdapter(id)!
    tasks.push({
      id,
      load: async () => {
        if (id === 'linuxdo') {
          const result = await request(adapter.accountsPath) as {
            enabled: boolean
            account: { id: string; username: string; status: string } | null
          }
          if (!result.enabled || !result.account) return null
          return {
            id,
            label: adapter.label,
            accounts: normalizeIndexedAccounts(id, [{
              id: result.account.id,
              name: result.account.username,
              username: result.account.username,
              status: result.account.status,
            }]),
          }
        }
        const result = await request(adapter.accountsPath) as AccountResult
        return result.accounts.length ? {
          id,
          label: adapter.label,
          accounts: normalizeIndexedAccounts(id, result.accounts),
        } : null
      },
    })
  }

  const settled = await Promise.allSettled(tasks.map(({ load }) => load()))
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      if (result.value) sources.push(result.value)
    } else unavailable.push(tasks[index].id)
  })
  const upgradeRequired = INDEXED_SOURCE_IDS.some((id) => (
    sourceEnabled(config, id) && !hasSourceScopes(scopes, id)
  ))
  return { sources, unavailable, upgradeRequired }
}

type MessageListResult = {
  messages: Array<
    GmailMessageSummary | MicrosoftMessageSummary | QqMailMessageSummary
    | NaverMailMessageSummary | YandexMailMessageSummary
  >
  page: { hasMore: boolean; nextCursor: string | null; limit: number }
}

function normalizeLinuxDoMessage(
  message: LinuxDoMailMessage,
  account: LinuxDoMailAccount,
): IndexedMessageSummary {
  return normalizeIndexedMessage({
    id: message.id,
    account: { id: account.id, name: account.username, email: account.username },
    senderName: message.from,
    senderAddress: message.from,
    recipients: [message.to],
    subject: message.subject,
    preview: message.preview,
    date: message.date,
    isRead: Boolean(message.isRead),
    hasAttachments: false,
  })
}

function normalizeLinuxDoDetail(
  message: LinuxDoMailMessage,
  account: LinuxDoMailAccount,
): IndexedMessageDetail {
  return {
    ...normalizeLinuxDoMessage(message, account),
    from: message.from,
    to: message.to,
    cc: '',
    body: message.body,
    html: message.html,
    attachmentCount: 0,
  }
}

export async function listIndexedSourceMessages(
  request: AuthenticatedRequest,
  input: { source: IndexedMailSourceId; accountId?: string; query?: string; folder?: 'inbox' | 'sent' },
): Promise<{ messages: IndexedMessageSummary[]; page: MessageListResult['page'] }> {
  const adapter = getIndexedSourceAdapter(input.source)
  if (!adapter) throw new Error('不支持的邮箱来源。')
  if (input.source === 'linuxdo') {
    const [mailResult, accountResult] = await Promise.all([
      request(adapter.messagesPath(input)) as Promise<{ messages: LinuxDoMailMessage[] }>,
      request(adapter.accountsPath) as Promise<{ account: LinuxDoMailAccount | null }>,
    ])
    const account = accountResult.account
    return {
      messages: account
        ? mailResult.messages.map((message) => normalizeLinuxDoMessage(message, account))
        : [],
      page: { hasMore: false, nextCursor: null, limit: 20 },
    }
  }
  const result = await request(adapter.messagesPath(input)) as MessageListResult
  return { messages: result.messages.map(normalizeIndexedMessage), page: result.page }
}

export async function getIndexedSourceMessage(
  request: AuthenticatedRequest,
  input: { source: IndexedMailSourceId; accountId: string; id: string; folder?: 'inbox' | 'sent' },
): Promise<{ message: IndexedMessageDetail }> {
  const adapter = getIndexedSourceAdapter(input.source)
  if (!adapter) throw new Error('不支持的邮箱来源。')
  if (input.source === 'linuxdo') {
    const [mailResult, accountResult] = await Promise.all([
      request(adapter.messagePath(input.accountId, input.id, input.folder)) as Promise<{
        message: LinuxDoMailMessage
      }>,
      request(adapter.accountsPath) as Promise<{ account: LinuxDoMailAccount | null }>,
    ])
    if (!accountResult.account) throw new Error('Linux DO Mail 账号已经断开。')
    return { message: normalizeLinuxDoDetail(mailResult.message, accountResult.account) }
  }
  const result = await request(adapter.messagePath(input.accountId, input.id, input.folder)) as {
    message: GmailMessageDetail | MicrosoftMessageDetail | QqMailMessageDetail
      | NaverMailMessageDetail | YandexMailMessageDetail
  }
  return { message: normalizeIndexedMessageDetail(result.message) }
}
