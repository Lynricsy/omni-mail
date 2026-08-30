import { describe, expect, it, vi } from 'vitest'
import type { AppConfig } from '../../src/shared/api/api-types'
import {
  discoverMailSources,
  getIndexedSourceMessage,
  INDEXED_SOURCE_SCOPES,
  LINUX_DO_SOURCE_SCOPES,
  listIndexedSourceMessages,
} from './mail-source-background'

function config(input: Partial<AppConfig> = {}): AppConfig {
  return {
    iCloudEnabled: false,
    iCloudWorkspaceEnabled: false,
    gmailEnabled: true,
    gmailWorkspaceEnabled: true,
    qqMailEnabled: true,
    qqMailWorkspaceEnabled: true,
    microsoftEnabled: true,
    microsoftWorkspaceEnabled: true,
    naverMailEnabled: true,
    naverMailWorkspaceEnabled: true,
    yandexMailEnabled: true,
    yandexMailWorkspaceEnabled: true,
    ...input,
  } as AppConfig
}

describe('Float mail source background adapters', () => {
  it('does not probe any indexed account before first explicit upgraded authorization', async () => {
    const request = vi.fn()
    await expect(discoverMailSources(request, config(), [])).resolves.toEqual({
      sources: [{ id: 'omnimail', label: 'OmniMail', accounts: [] }],
      unavailable: [],
      upgradeRequired: true,
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('keeps already-authorized sources while newer sources await upgrade', async () => {
    const request = vi.fn(async (path: string) => ({ accounts: [{
      id: path.includes('gmail') ? 'gmail-1' : 'qq-1', name: 'Existing',
      email: 'owner@example.com', status: 'active',
    }] }))
    const existingScopes = INDEXED_SOURCE_SCOPES.filter((scope) => (
      scope.startsWith('gmail:') || scope.startsWith('qq-mail:')
    ))
    const result = await discoverMailSources(request, config(), existingScopes)
    expect(result.sources.map(({ id }) => id)).toEqual(['omnimail', 'gmail', 'qq'])
    expect(result.upgradeRequired).toBe(true)
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/api/gmail/accounts', '/api/qq-mail/accounts',
    ])
  })

  it('discovers connected sources independently and retains account errors', async () => {
    const request = vi.fn(async (path: string) => {
      if (path === '/api/gmail/accounts') return { accounts: [{
        id: 'gmail-1', name: 'Gmail', email: 'owner@gmail.com', status: 'credential_error',
      }] }
      if (path === '/api/qq-mail/accounts') throw new Error('QQ temporarily unavailable')
      throw new Error(`unexpected path ${path}`)
    })
    const result = await discoverMailSources(request, config({
      microsoftEnabled: false, naverMailEnabled: false, yandexMailEnabled: false,
    }), [...INDEXED_SOURCE_SCOPES])
    expect(result.sources.map(({ id }) => id)).toEqual(['omnimail', 'gmail'])
    expect(result.sources[1].accounts[0]).toMatchObject({ status: 'error', needsAttention: true })
    expect(result.unavailable).toEqual(['qq'])
    expect(result.upgradeRequired).toBe(false)
  })

  it('normalizes list and detail calls through the selected fixed adapter', async () => {
    const summary = {
      id: 'message-1',
      account: { id: 'gmail-1', name: 'Gmail', email: 'owner@gmail.com' },
      senderName: 'Sender', senderAddress: 'sender@example.net', recipients: ['owner@gmail.com'],
      subject: 'Code', preview: '123456', date: 123, isRead: false, hasAttachments: false,
    }
    const request = vi.fn(async (path: string) => path.includes('/messages?')
      ? { messages: [summary], page: { hasMore: false, nextCursor: null, limit: 30 } }
      : { message: { ...summary, date: new Date(123).toISOString(), from: 'Sender',
        to: 'owner@gmail.com', cc: '', body: '123456', html: '<p>123456</p>', attachments: [] } })
    const listed = await listIndexedSourceMessages(request, {
      source: 'gmail', accountId: 'gmail-1', query: 'code',
    })
    expect(listed.messages[0]).toMatchObject({ accountId: 'gmail-1', subject: 'Code' })
    const detail = await getIndexedSourceMessage(request, {
      source: 'gmail', accountId: 'gmail-1', id: 'message-1',
    })
    expect(detail.message).toMatchObject({ body: '123456', attachmentCount: 0 })
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/api/gmail/messages?limit=30&accountId=gmail-1&q=code',
      '/api/gmail/accounts/gmail-1/messages/message-1',
    ])
  })

  it('discovers and reads Linux DO through its dedicated live adapter', async () => {
    const account = {
      id: 'linuxdo-1', username: 'owner@linux.do', status: 'active',
      lastValidated: '', lastError: '', createdAt: '', hasPassword: true,
    }
    const message = {
      id: '42', from: 'Sender <sender@example.net>', to: 'owner@linux.do',
      subject: 'Code', date: new Date(123).toISOString(), preview: '246810',
      body: '246810', html: '<p>246810</p>', isRead: false,
    }
    const request = vi.fn(async (path: string) => {
      if (path === '/api/linux-do-mail/account') return { enabled: true, account }
      if (path === '/api/linux-do-mail/inbox?q=code') return { messages: [message] }
      if (path === '/api/linux-do-mail/sent/sent-1') {
        return { message: { ...message, id: 'sent-1', direction: 'outgoing' } }
      }
      throw new Error(`unexpected path ${path}`)
    })
    const discovered = await discoverMailSources(request, config({
      gmailEnabled: false, microsoftEnabled: false, qqMailEnabled: false,
      naverMailEnabled: false, yandexMailEnabled: false,
      linuxDoMailWorkspaceEnabled: true,
    }), [...LINUX_DO_SOURCE_SCOPES])
    expect(discovered.sources.map(({ id }) => id)).toEqual(['omnimail', 'linuxdo'])
    const listed = await listIndexedSourceMessages(request, {
      source: 'linuxdo', query: 'code', folder: 'inbox',
    })
    expect(listed.messages[0]).toMatchObject({ id: '42', accountEmail: 'owner@linux.do' })
    const detail = await getIndexedSourceMessage(request, {
      source: 'linuxdo', accountId: 'linuxdo-1', id: 'sent-1', folder: 'sent',
    })
    expect(detail.message).toMatchObject({ id: 'sent-1', body: '246810' })
  })
})
