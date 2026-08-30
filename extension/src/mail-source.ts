export const INDEXED_SOURCE_IDS = ['gmail', 'microsoft', 'qq', 'naver', 'yandex', 'linuxdo'] as const

export type IndexedMailSourceId = typeof INDEXED_SOURCE_IDS[number]
export type MailSourceId = 'omnimail' | 'icloud' | IndexedMailSourceId

export interface MailSourceAccount {
  id: string
  name: string
  email: string
  status: 'active' | 'syncing' | 'error'
  needsAttention: boolean
}

export interface MailSourceDescriptor {
  id: MailSourceId
  label: string
  accounts: MailSourceAccount[]
}

export interface IndexedMessageSummary {
  id: string
  accountId: string
  accountName: string
  accountEmail: string
  senderName: string
  senderAddress: string
  recipients: string[]
  subject: string
  preview: string
  date: number
  isRead: boolean
  hasAttachments: boolean
}

export interface IndexedMessageDetail extends IndexedMessageSummary {
  from: string
  to: string
  cc: string
  body: string
  html: string
  attachmentCount: number
}

export interface IndexedSourceAdapter {
  id: IndexedMailSourceId
  label: string
  accountsPath: string
  webPath: string
  messagesPath(input: { accountId?: string; query?: string; folder?: 'inbox' | 'sent' }): string
  messagePath(accountId: string, messageId: string, folder?: 'inbox' | 'sent'): string
}

function adapter(id: IndexedMailSourceId, label: string, apiRoot: string): IndexedSourceAdapter {
  return {
    id,
    label,
    accountsPath: `/api/${apiRoot}/accounts`,
    webPath: `/${apiRoot}`,
    messagesPath: ({ accountId, query }) => {
      const search = new URLSearchParams({ limit: '30' })
      if (accountId) search.set('accountId', accountId)
      if (query) search.set('q', query)
      return `/api/${apiRoot}/messages?${search}`
    },
    messagePath: (accountId, messageId) => (
      `/api/${apiRoot}/accounts/${encodeURIComponent(accountId)}`
      + `/messages/${encodeURIComponent(messageId)}`
    ),
  }
}

function linuxDoAdapter(): IndexedSourceAdapter {
  return {
    id: 'linuxdo',
    label: 'Linux DO Mail',
    accountsPath: '/api/linux-do-mail/account',
    webPath: '/linuxdo-mail',
    messagesPath: ({ query, folder = 'inbox' }) => {
      const value = query?.trim()
      return value
        ? `/api/linux-do-mail/${folder}?q=${encodeURIComponent(value)}`
        : `/api/linux-do-mail/${folder}`
    },
    messagePath: (_accountId, messageId, folder = 'inbox') => (
      `/api/linux-do-mail/${folder}/${encodeURIComponent(messageId)}`
    ),
  }
}

const INDEXED_SOURCE_ADAPTERS: Record<IndexedMailSourceId, IndexedSourceAdapter> = {
  gmail: adapter('gmail', 'Gmail', 'gmail'),
  microsoft: adapter('microsoft', 'Microsoft', 'microsoft'),
  qq: adapter('qq', 'QQ 邮箱', 'qq-mail'),
  naver: adapter('naver', 'NAVER', 'naver-mail'),
  yandex: adapter('yandex', 'Yandex', 'yandex-mail'),
  linuxdo: linuxDoAdapter(),
}

export function getIndexedSourceAdapter(value: string): IndexedSourceAdapter | null {
  return INDEXED_SOURCE_IDS.includes(value as IndexedMailSourceId)
    ? INDEXED_SOURCE_ADAPTERS[value as IndexedMailSourceId]
    : null
}

interface AccountInput {
  id: string
  name: string
  email?: string
  username?: string
  status: string
}

export function normalizeIndexedAccounts(
  source: IndexedMailSourceId,
  accounts: AccountInput[],
): MailSourceAccount[] {
  if (!getIndexedSourceAdapter(source)) return []
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    email: account.email || account.username || '',
    status: account.status === 'syncing'
      ? 'syncing'
      : account.status === 'active' ? 'active' : 'error',
    needsAttention: !['active', 'syncing'].includes(account.status),
  }))
}

interface MessageInput {
  id: string
  account: { id: string; name: string; email: string }
  senderName: string
  senderAddress: string
  recipients: string[]
  subject: string
  preview: string
  date: number | string
  isRead: boolean
  hasAttachments: boolean
}

export function normalizeIndexedMessage(message: MessageInput): IndexedMessageSummary {
  const parsedDate = typeof message.date === 'number' ? message.date : Date.parse(message.date)
  return {
    id: message.id,
    accountId: message.account.id,
    accountName: message.account.name,
    accountEmail: message.account.email,
    senderName: message.senderName,
    senderAddress: message.senderAddress,
    recipients: message.recipients,
    subject: message.subject,
    preview: message.preview,
    date: Number.isFinite(parsedDate) ? parsedDate : 0,
    isRead: message.isRead,
    hasAttachments: message.hasAttachments,
  }
}

interface MessageDetailInput extends MessageInput {
  from: string
  to: string
  cc: string
  body: string
  html: string
  attachments: unknown[]
}

export function normalizeIndexedMessageDetail(
  message: MessageDetailInput,
): IndexedMessageDetail {
  return {
    ...normalizeIndexedMessage(message),
    from: message.from,
    to: message.to,
    cc: message.cc,
    body: message.body,
    html: message.html,
    attachmentCount: message.attachments.length,
  }
}
