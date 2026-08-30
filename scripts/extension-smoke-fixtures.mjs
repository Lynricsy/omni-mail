export const user = {
  id: 'user-1', email: 'owner@example.com', displayName: 'Owner', role: 'super_admin',
  mailboxLimit: 20, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: true, canReply: true, canTranslate: true, temporaryExpiresAt: null,
}

export const mailboxes = [{
  address: 'inbox@example.com', domain: 'example.com', isPrimary: true, isActive: true,
}]

export const message = {
  id: 'message-1', mailboxAddress: 'inbox@example.com', direction: 'incoming',
  status: 'ready', folder: 'inbox', senderName: 'OmniMail Test',
  senderAddress: 'sender@example.net', recipients: ['inbox@example.com'],
  subject: 'Your verification code', preview: 'Code 123456', date: Date.now(),
  attachmentCount: 0, isRead: false, isStarred: false, processingError: null,
  deliveryStatus: null, purgeAfter: null,
}

export const legacyExtensionScopes = [
  'domains:read', 'mailboxes:read', 'mailboxes:create', 'messages:read',
  'messages:mark-read', 'icloud:accounts:read', 'icloud:aliases:read',
  'icloud:aliases:create', 'icloud:messages:read',
]

export const float040Scopes = [
  ...legacyExtensionScopes, 'gmail:accounts:read',
  'gmail:messages:read', 'qq-mail:accounts:read', 'qq-mail:messages:read',
]

export const float041Scopes = [
  ...float040Scopes, 'microsoft:accounts:read', 'microsoft:messages:read',
  'naver-mail:accounts:read', 'naver-mail:messages:read',
  'yandex-mail:accounts:read', 'yandex-mail:messages:read',
]

export const extensionScopes = [
  ...float041Scopes, 'mail-notifications:read',
  'linuxdo-mail:account:read', 'linuxdo-mail:messages:read',
  'messages:attachments:read', 'messages:send', 'drafts:read', 'drafts:write',
  'gmail:attachments:read', 'gmail:sync',
  'qq-mail:attachments:read', 'qq-mail:sync', 'qq-mail:messages:send',
  'microsoft:attachments:read', 'microsoft:folders:read', 'microsoft:sync',
  'naver-mail:attachments:read', 'naver-mail:sync',
  'yandex-mail:attachments:read', 'yandex-mail:sync',
  'linuxdo-mail:messages:send',
]

export const iCloudAccounts = [{
  id: 'icloud-account-1', name: 'Personal iCloud', realEmail: 'owner@icloud.com',
  icloudEmail: 'owner@icloud.com', host: 'icloud.com', status: 'active',
  aliasTotal: 3, aliasActive: 3, lastValidated: new Date().toISOString(),
  lastError: '', createdAt: new Date().toISOString(), hasCookies: true, hasAppPassword: false,
}]

export const iCloudAliases = [{
  email: 'existing-alias@icloud.com', anonymousId: 'existing-alias-1',
  label: '已有地址', active: true, createdAt: new Date().toISOString(),
}]

export const iCloudMessage = {
  id: 'icloud-message-1', from: 'Apple Test <sender@example.net>',
  to: 'float-preview@icloud.com', subject: 'Your iCloud verification code',
  date: new Date().toISOString(), preview: 'Your iCloud code is 654321.',
  body: 'Your iCloud code is 654321.', html: '<p>Your iCloud code is <strong>654321</strong>.</p>',
}

export function deferred() {
  let resolvePromise
  const promise = new Promise((resolve) => { resolvePromise = resolve })
  return { promise, resolve: resolvePromise }
}

export async function requestBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}

export function json(response, body, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}
