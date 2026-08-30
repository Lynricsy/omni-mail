import { describe, expect, it } from 'vitest'
import {
  ANDROID_DEVICE_SCOPES,
  deviceScopesForClient,
  refreshedDeviceScopes,
  deviceScopesAllow,
  EXTENSION_DEVICE_SCOPES,
  FULL_DEVICE_SCOPES,
} from './token-scope'

describe('device token scopes', () => {
  function request(path: string, method = 'GET', body?: unknown): Request {
    return new Request(`https://mail.example.com${path}`, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  it('keeps full desktop tokens backwards compatible', async () => {
    await expect(deviceScopesAllow(
      FULL_DEVICE_SCOPES,
      request('/api/admin/users'),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(
      FULL_DEVICE_SCOPES,
      request('/api/messages', 'POST'),
    )).resolves.toBe(true)
  })

  it('uses one Linux DO message read scope for inbox and sent mail', async () => {
    const scopes = 'linuxdo-mail:messages:read'
    await expect(deviceScopesAllow(scopes, request('/api/linux-do-mail/inbox')))
      .resolves.toBe(true)
    await expect(deviceScopesAllow(scopes, request('/api/linux-do-mail/inbox/42')))
      .resolves.toBe(true)
    await expect(deviceScopesAllow(scopes, request('/api/linux-do-mail/sent')))
      .resolves.toBe(true)
    await expect(deviceScopesAllow(scopes, request('/api/linux-do-mail/sent/message-1')))
      .resolves.toBe(true)
  })

  it('selects least-privilege scopes only for explicit Android clients', () => {
    expect(deviceScopesForClient('android')).toBe(ANDROID_DEVICE_SCOPES)
    expect(deviceScopesForClient('Android')).toBe(FULL_DEVICE_SCOPES)
    expect(deviceScopesForClient(undefined)).toBe(FULL_DEVICE_SCOPES)
    expect(refreshedDeviceScopes(FULL_DEVICE_SCOPES, 'android')).toBe(ANDROID_DEVICE_SCOPES)
    expect(refreshedDeviceScopes(EXTENSION_DEVICE_SCOPES, 'android')).toBe(EXTENSION_DEVICE_SCOPES)
  })

  it('allows the Android mail, draft, attachment, account, and iCloud workflows', async () => {
    const allowed: Array<[string, string, unknown?]> = [
      ['/api/mailboxes', 'GET'],
      ['/api/messages', 'GET'],
      ['/api/messages', 'POST'],
      ['/api/messages/message-1', 'GET'],
      ['/api/messages/message-1', 'PATCH', { folder: 'trash' }],
      ['/api/messages/message-1', 'DELETE'],
      ['/api/messages/bulk', 'PATCH', { ids: ['message-1'], action: 'read' }],
      ['/api/messages/message-1/reply', 'POST'],
      ['/api/messages/message-1/attachments/file-1', 'GET'],
      ['/api/account', 'PATCH'],
      ['/api/drafts', 'GET'],
      ['/api/drafts', 'POST'],
      ['/api/drafts/draft-1', 'GET'],
      ['/api/drafts/draft-1', 'PUT'],
      ['/api/drafts/draft-1', 'DELETE'],
      ['/api/drafts/draft-1/attachments', 'POST'],
      ['/api/drafts/draft-1/attachments/file-1', 'DELETE'],
      ['/api/drafts/draft-1/send', 'POST'],
      ['/api/icloud/accounts', 'GET'],
      ['/api/icloud/accounts', 'POST'],
      ['/api/icloud/accounts/account-1', 'PATCH'],
      ['/api/icloud/accounts/account-1', 'DELETE'],
      ['/api/icloud/accounts/account-1/cookies', 'PUT'],
      ['/api/icloud/accounts/account-1/app-password', 'PUT'],
      ['/api/icloud/aliases', 'GET'],
      ['/api/icloud/aliases/preview', 'POST'],
      ['/api/icloud/aliases', 'POST'],
      ['/api/icloud/aliases/alias-1', 'PATCH'],
      ['/api/icloud/aliases/alias-1', 'DELETE'],
      ['/api/icloud/inbox', 'GET'],
      ['/api/icloud/inbox/42', 'GET'],
    ]
    for (const [path, method, body] of allowed) {
      await expect(deviceScopesAllow(
        ANDROID_DEVICE_SCOPES,
        request(path, method, body),
      ), `${method} ${path}`).resolves.toBe(true)
    }
  })

  it('denies administrative and unrelated self-service APIs to Android tokens', async () => {
    const denied: Array<[string, string]> = [
      ['/api/admin/users', 'GET'],
      ['/api/auth/devices', 'GET'],
      ['/api/system/settings', 'PATCH'],
      ['/api/account', 'DELETE'],
      ['/api/mailboxes', 'POST'],
      ['/api/messages/message-1/raw', 'GET'],
      ['/api/linux-do-mail/account', 'GET'],
      ['/api/linux-do-mail/account', 'POST'],
      ['/api/linux-do-mail/account/credential', 'PUT'],
      ['/api/linux-do-mail/inbox', 'GET'],
      ['/api/linux-do-mail/sent', 'GET'],
      ['/api/linux-do-mail/messages', 'POST'],
    ]
    for (const [path, method] of denied) {
      await expect(deviceScopesAllow(
        ANDROID_DEVICE_SCOPES,
        request(path, method),
      ), `${method} ${path}`).resolves.toBe(false)
    }
  })

  it('allows only the APIs used by OmniMail Float', async () => {
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/mail-notifications?sources=icloud,linuxdo'),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/domains'))).resolves.toBe(true)
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/mailboxes'))).resolves.toBe(true)
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/mailboxes', 'POST'))).resolves.toBe(true)
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/messages'))).resolves.toBe(true)
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/messages/message-1'))).resolves.toBe(true)
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/messages', 'POST'),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/messages/message-1/reply', 'POST'),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/drafts', 'POST'),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/drafts/draft-1/attachments', 'POST'),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/drafts/draft-1/send', 'POST'),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/messages/message-1/attachments/attachment-1'),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/messages/message-1', 'PATCH', { isRead: true }),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/icloud/accounts'),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/icloud/aliases?accountId=icloud-1'),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/icloud/aliases', 'POST', { accountId: 'icloud-1', label: '购物' }),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/icloud/inbox?accountId=icloud-1'),
    )).resolves.toBe(true)
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/icloud/inbox/42?accountId=icloud-1'),
    )).resolves.toBe(true)
    const indexedReadPaths = [
      '/api/gmail/accounts',
      '/api/gmail/messages?q=code',
      '/api/gmail/accounts/gmail-1/messages/message-1',
      '/api/qq-mail/accounts',
      '/api/qq-mail/messages?accountId=qq-1',
      '/api/qq-mail/accounts/qq-1/messages/message-1',
      '/api/microsoft/accounts',
      '/api/microsoft/messages?accountId=microsoft-1',
      '/api/microsoft/accounts/microsoft-1/messages/message-1',
      '/api/naver-mail/accounts',
      '/api/naver-mail/messages?accountId=naver-1',
      '/api/naver-mail/accounts/naver-1/messages/message-1',
      '/api/yandex-mail/accounts',
      '/api/yandex-mail/messages?accountId=yandex-1',
      '/api/yandex-mail/accounts/yandex-1/messages/message-1',
      '/api/linux-do-mail/account',
      '/api/linux-do-mail/inbox?q=code',
      '/api/linux-do-mail/inbox/42',
      '/api/linux-do-mail/sent',
      '/api/linux-do-mail/sent/message-1',
    ]
    for (const path of indexedReadPaths) {
      await expect(deviceScopesAllow(
        EXTENSION_DEVICE_SCOPES,
        request(path),
      ), path).resolves.toBe(true)
    }
    const indexedReadingCapabilities: Array<[string, string]> = [
      ['/api/gmail/accounts/gmail-1/sync', 'POST'],
      ['/api/gmail/accounts/gmail-1/messages/message-1/attachments/part-1', 'GET'],
      ['/api/qq-mail/accounts/qq-1/sync', 'POST'],
      ['/api/qq-mail/accounts/qq-1/messages/message-1/attachments/part-1', 'GET'],
      ['/api/microsoft/accounts/microsoft-1/sync', 'POST'],
      ['/api/microsoft/accounts/microsoft-1/folders', 'GET'],
      ['/api/microsoft/accounts/microsoft-1/messages/message-1/attachments/part-1', 'GET'],
      ['/api/naver-mail/accounts/naver-1/sync', 'POST'],
      ['/api/naver-mail/accounts/naver-1/messages/message-1/attachments/part-1', 'GET'],
      ['/api/yandex-mail/accounts/yandex-1/sync', 'POST'],
      ['/api/yandex-mail/accounts/yandex-1/messages/message-1/attachments/part-1', 'GET'],
      ['/api/qq-mail/accounts/qq-1/messages', 'POST'],
      ['/api/linux-do-mail/messages', 'POST'],
    ]
    for (const [path, method] of indexedReadingCapabilities) {
      await expect(deviceScopesAllow(
        EXTENSION_DEVICE_SCOPES,
        request(path, method),
      ), `${method} ${path}`).resolves.toBe(true)
    }
  })

  it('denies administrative and destructive APIs to extension tokens', async () => {
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/admin/users'))).resolves.toBe(false)
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/messages/message-1', 'DELETE'))).resolves.toBe(false)
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/messages/message-1/raw'))).resolves.toBe(false)
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/auth/devices'))).resolves.toBe(false)
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/icloud/aliases/alias-1', 'PATCH'))).resolves.toBe(false)
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/icloud/aliases/alias-1', 'DELETE'))).resolves.toBe(false)
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/icloud/aliases/preview', 'POST'))).resolves.toBe(false)
    await expect(deviceScopesAllow(EXTENSION_DEVICE_SCOPES, request('/api/icloud/accounts/icloud-1/cookies', 'PUT'))).resolves.toBe(false)
    const indexedWrites: Array<[string, string]> = [
      ['/api/gmail/accounts', 'POST'],
      ['/api/qq-mail/accounts', 'POST'],
      ['/api/qq-mail/accounts/qq-1/identities', 'POST'],
      ['/api/microsoft/accounts', 'POST'],
      ['/api/naver-mail/accounts', 'POST'],
      ['/api/yandex-mail/accounts', 'POST'],
      ['/api/linux-do-mail/account', 'POST'],
      ['/api/linux-do-mail/account', 'DELETE'],
      ['/api/linux-do-mail/account/verify', 'POST'],
      ['/api/linux-do-mail/account/credential', 'PUT'],
    ]
    for (const [path, method] of indexedWrites) {
      await expect(deviceScopesAllow(
        EXTENSION_DEVICE_SCOPES,
        request(path, method),
      ), `${method} ${path}`).resolves.toBe(false)
    }
    await expect(deviceScopesAllow(
      EXTENSION_DEVICE_SCOPES,
      request('/api/messages/message-1', 'PATCH', { folder: 'trash' }),
    )).resolves.toBe(false)
  })
})
