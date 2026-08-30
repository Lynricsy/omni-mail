export interface NotificationTab {
  id?: number
  windowId?: number
  url?: string
}

export interface NotificationBrowser {
  listTabs(urlPattern: string): Promise<NotificationTab[]>
  activateTab(tabId: number): Promise<void>
  navigateTab(tabId: number, url: string): Promise<void>
  focusWindow(windowId: number): Promise<void>
  createTab(url: string): Promise<void>
  clearNotification(notificationId: string): Promise<void>
}

function inboxTarget(value: unknown, route = '/mail/inbox'): {
  destination: string
  urlPattern: string
} | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    const localHttp = url.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !localHttp) return null
    if (url.username || url.password) return null
    const target = new URL(route, url.origin)
    if (target.origin !== url.origin || !target.pathname.startsWith('/')) return null
    return {
      destination: target.toString(),
      urlPattern: `${url.protocol}//${url.hostname}/*`,
    }
  } catch {
    return null
  }
}

function isInboxTab(tab: NotificationTab, destination: string): boolean {
  if (!tab.url) return false
  try {
    const current = new URL(tab.url)
    const target = new URL(destination)
    return current.origin === target.origin
      && current.pathname.replace(/\/+$/, '') === target.pathname
  } catch {
    return false
  }
}

export async function handleNotificationClick(
  notificationId: string,
  apiOrigin: unknown,
  browser: NotificationBrowser,
  route?: string,
): Promise<void> {
  try {
    const target = inboxTarget(apiOrigin, route)
    if (!target) return
    const existing = (await browser.listTabs(target.urlPattern))
      .find((tab) => isInboxTab(tab, target.destination))
    if (existing?.id !== undefined) {
      if (existing.url !== target.destination) {
        await browser.navigateTab(existing.id, target.destination)
      }
      await browser.activateTab(existing.id)
      if (existing.windowId !== undefined) await browser.focusWindow(existing.windowId)
      return
    }
    await browser.createTab(target.destination)
  } finally {
    await browser.clearNotification(notificationId)
  }
}

export async function handleChromeNotificationClick(notificationId: string): Promise<void> {
  let settings: { apiOrigin?: unknown; notificationTargets?: unknown }
  try {
    settings = await chrome.storage.local.get(['apiOrigin', 'notificationTargets'])
  } catch {
    await chrome.notifications.clear(notificationId)
    return
  }
  const targets = settings.notificationTargets && typeof settings.notificationTargets === 'object'
    ? settings.notificationTargets as Record<string, unknown> : {}
  const route = typeof targets[notificationId] === 'string' ? targets[notificationId] as string : undefined
  await handleNotificationClick(notificationId, settings.apiOrigin, {
    listTabs: (urlPattern) => chrome.tabs.query({ url: urlPattern }),
    activateTab: async (tabId) => { await chrome.tabs.update(tabId, { active: true }) },
    navigateTab: async (tabId, url) => { await chrome.tabs.update(tabId, { url }) },
    focusWindow: async (windowId) => { await chrome.windows.update(windowId, { focused: true }) },
    createTab: async (url) => { await chrome.tabs.create({ url }) },
    clearNotification: async (id) => { await chrome.notifications.clear(id) },
  }, route).catch(() => {})
  if (route) {
    delete targets[notificationId]
    await chrome.storage.local.set({ notificationTargets: targets }).catch(() => {})
  }
}
