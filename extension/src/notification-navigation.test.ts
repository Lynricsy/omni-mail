import { describe, expect, it, vi } from 'vitest'
import {
  handleNotificationClick,
  type NotificationBrowser,
} from './notification-navigation'

function browser(tabs: Array<{ id?: number; windowId?: number; url?: string }> = []) {
  return {
    listTabs: vi.fn(async (_urlPattern: string) => tabs),
    activateTab: vi.fn(async () => {}),
    navigateTab: vi.fn(async () => {}),
    focusWindow: vi.fn(async () => {}),
    createTab: vi.fn(async () => {}),
    clearNotification: vi.fn(async () => {}),
  } satisfies NotificationBrowser
}

describe('Float notification navigation', () => {
  it('activates an existing Web inbox instead of an extension panel tab', async () => {
    const target = browser([
      { id: 1, windowId: 2, url: 'chrome-extension://example/panel.html#inbox' },
      { id: 3, windowId: 4, url: 'https://mail.example.com/mail/inbox?from=notification' },
    ])
    await handleNotificationClick('omnimail:message-1', 'https://mail.example.com', target)
    expect(target.listTabs).toHaveBeenCalledWith('https://mail.example.com/*')
    expect(target.activateTab).toHaveBeenCalledWith(3)
    expect(target.navigateTab).toHaveBeenCalledWith(
      3,
      'https://mail.example.com/mail/inbox',
    )
    expect(target.focusWindow).toHaveBeenCalledWith(4)
    expect(target.createTab).not.toHaveBeenCalled()
    expect(target.clearNotification).toHaveBeenCalledWith('omnimail:message-1')
  })

  it('opens and reuses a fixed source deep link', async () => {
    const target = browser([{ id: 8, windowId: 9, url: 'https://mail.example.com/gmail' }])
    await handleNotificationClick(
      'float:gmail:message-1',
      'https://mail.example.com',
      target,
      '/gmail?accountId=gmail-1&messageId=message-1',
    )
    expect(target.navigateTab).toHaveBeenCalledWith(
      8,
      'https://mail.example.com/gmail?accountId=gmail-1&messageId=message-1',
    )
    expect(target.activateTab).toHaveBeenCalledWith(8)
  })

  it('opens a new Web inbox without replacing another OmniMail workspace', async () => {
    const target = browser([
      { id: 3, windowId: 4, url: 'https://mail.example.com/mail/drafts' },
    ])
    await handleNotificationClick('omnimail:message-2', 'https://mail.example.com', target)
    expect(target.listTabs).toHaveBeenCalledWith('https://mail.example.com/*')
    expect(target.activateTab).not.toHaveBeenCalled()
    expect(target.createTab).toHaveBeenCalledWith('https://mail.example.com/mail/inbox')
    expect(target.clearNotification).toHaveBeenCalledWith('omnimail:message-2')
  })

  it('keeps the configured localhost port while querying only that host', async () => {
    const target = browser()
    await handleNotificationClick('omnimail:local', 'http://127.0.0.1:8787', target)
    expect(target.listTabs).toHaveBeenCalledWith('http://127.0.0.1/*')
    expect(target.createTab).toHaveBeenCalledWith('http://127.0.0.1:8787/mail/inbox')
  })

  it('rejects unsafe origins and still clears the clicked notification', async () => {
    const target = browser()
    await handleNotificationClick('omnimail:message-3', 'javascript:alert(1)', target)
    expect(target.listTabs).not.toHaveBeenCalled()
    expect(target.createTab).not.toHaveBeenCalled()
    expect(target.clearNotification).toHaveBeenCalledWith('omnimail:message-3')
  })
})
