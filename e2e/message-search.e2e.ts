import { expect, type Route, test } from '@playwright/test'
import { message, user } from './omnimail-fixtures'

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

test('mail search debounces input and aborts the previous request', async ({ page }) => {
  const queries: string[] = []
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
    const state = window as typeof window & {
      __searchStarted?: string[]
      __searchAborted?: string[]
    }
    state.__searchStarted = []
    state.__searchAborted = []
    const nativeFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = new URL(String(input), window.location.href)
      if (url.searchParams.get('q') !== 'first') return nativeFetch(input, init)
      state.__searchStarted?.push('first')
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          state.__searchAborted?.push('first')
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      })
    }
  })
  await page.route('**://*/api/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: false,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '',
      mailRefreshInterval: 30, remoteImagesEnabled: false,
      unassignedMailEnabled: false, superAdminEmail: user.email,
      setupRequirements: {
        databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false,
      },
    })
    if (url.pathname === '/api/session') return json(route, { user })
    if (url.pathname === '/api/mailboxes') return json(route, { mailboxes: [{
      address: 'inbox@example.com', domain: 'example.com',
      isPrimary: true, isActive: true,
    }] })
    if (url.pathname === '/api/domains') return json(route, { domains: [] })
    if (url.pathname === '/api/drafts') return json(route, { drafts: [], limit: 5 })
    if (url.pathname === '/api/messages') {
      queries.push(url.searchParams.get('q') || '')
      return json(route, {
        unchanged: false, version: 1, messages: [message],
        counts: { unread: 0, starred: 0, drafts: 0, sent: 0, trash: 0 },
        page: { hasMore: false, nextCursor: null, limit: 30 },
      })
    }
    return json(route, {})
  })

  await page.goto('/')
  await expect(page.getByText(message.subject)).toBeVisible()
  const input = page.locator('.search-field input')
  await input.pressSequentially('invoice', { delay: 40 })
  expect(queries.filter(Boolean)).toEqual([])
  await expect.poll(() => queries.filter(Boolean)).toEqual(['invoice'])

  await input.fill('first')
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & { __searchStarted?: string[] }).__searchStarted
  ))).toEqual(['first'])
  await input.fill('second')
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & { __searchAborted?: string[] }).__searchAborted
  ))).toEqual(['first'])
  await expect.poll(() => queries.filter(Boolean)).toEqual(['invoice', 'second'])
})
