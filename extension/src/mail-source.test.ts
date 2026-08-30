import { describe, expect, it } from 'vitest'
import {
  getIndexedSourceAdapter,
  normalizeIndexedAccounts,
  normalizeIndexedMessage,
} from './mail-source'

describe('Float indexed mail source adapters', () => {
  it('builds only fixed indexed-source API paths', () => {
    const gmail = getIndexedSourceAdapter('gmail')!
    expect(gmail.accountsPath).toBe('/api/gmail/accounts')
    expect(gmail.messagesPath({ accountId: 'account / 1', query: 'code & test' }))
      .toBe('/api/gmail/messages?limit=30&accountId=account+%2F+1&q=code+%26+test')
    expect(gmail.messagePath('account / 1', 'message ? 1'))
      .toBe('/api/gmail/accounts/account%20%2F%201/messages/message%20%3F%201')
    expect(gmail.messagesPath({ cursor: 'next / page' }))
      .toBe('/api/gmail/messages?limit=30&cursor=next+%2F+page')
    expect(gmail.attachmentPath('account / 1', 'message ? 1', 'part / 1'))
      .toBe('/api/gmail/accounts/account%20%2F%201/messages/message%20%3F%201/attachments/part%20%2F%201')
    expect(gmail.syncPath?.('account / 1'))
      .toBe('/api/gmail/accounts/account%20%2F%201/sync')

    const qq = getIndexedSourceAdapter('qq')!
    expect(qq.accountsPath).toBe('/api/qq-mail/accounts')
    expect(qq.webPath).toBe('/qq-mail')
    expect(getIndexedSourceAdapter('microsoft')?.accountsPath).toBe('/api/microsoft/accounts')
    expect(getIndexedSourceAdapter('microsoft')?.foldersPath?.('account / 1'))
      .toBe('/api/microsoft/accounts/account%20%2F%201/folders')
    expect(getIndexedSourceAdapter('microsoft')?.messagesPath({
      accountId: 'account-1', folder: 'Archive / 2026',
    })).toBe('/api/microsoft/messages?limit=30&accountId=account-1&folder=Archive+%2F+2026')
    expect(getIndexedSourceAdapter('naver')?.webPath).toBe('/naver-mail')
    expect(getIndexedSourceAdapter('yandex')?.messagePath('account-1', 'message-1'))
      .toBe('/api/yandex-mail/accounts/account-1/messages/message-1')
    expect(getIndexedSourceAdapter('https://attacker.example')).toBeNull()
  })

  it('keeps connected accounts visible when credentials need repair', () => {
    expect(normalizeIndexedAccounts('gmail', [{
      id: 'gmail-1', name: 'Personal Gmail', email: 'owner@gmail.com',
      status: 'credential_error',
    }])).toEqual([{
      id: 'gmail-1', name: 'Personal Gmail', email: 'owner@gmail.com',
      status: 'error', needsAttention: true,
    }])
  })

  it('normalizes indexed message fields without provider-specific data', () => {
    expect(normalizeIndexedMessage({
      id: 'message-1',
      account: { id: 'gmail-1', name: 'Personal Gmail', email: 'owner@gmail.com' },
      senderName: 'Sender', senderAddress: 'sender@example.net', recipients: ['owner@gmail.com'],
      subject: 'Code', preview: '123456', date: 123, isRead: false, hasAttachments: true,
    })).toEqual({
      id: 'message-1', accountId: 'gmail-1', accountName: 'Personal Gmail',
      accountEmail: 'owner@gmail.com', senderName: 'Sender', senderAddress: 'sender@example.net',
      recipients: ['owner@gmail.com'], subject: 'Code', preview: '123456', date: 123,
      isRead: false, hasAttachments: true,
    })
  })
})
