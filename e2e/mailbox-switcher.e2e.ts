import { expect, test } from '@playwright/test'
import { message, user } from './omnimail-fixtures'

test('mailbox rows copy addresses without changing the current scope', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          localStorage.setItem('omnimail-test-copied', value)
        },
      },
    })
  })
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    const responses: Record<string, unknown> = {
      '/api/config': {
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
      },
      '/api/session': { user },
      '/api/mailboxes': {
        mailboxes: [{
          address: 'inbox@example.com', domain: 'example.com',
          isPrimary: true, isActive: true,
        }, ...Array.from({ length: 9 }, (_, index) => ({
          address: `omni-${index + 1}@example.com`, domain: 'example.com',
          isPrimary: false, isActive: true,
        }))],
      },
      '/api/domains': {
        domains: [{
          name: 'example.com', isActive: true, mailboxCount: 10,
          createdAt: 1, updatedAt: 1,
        }],
      },
      '/api/messages': {
        unchanged: false, version: 1, messages: [message],
        counts: { unread: 0, starred: 0, sent: 0, trash: 0 },
        page: { hasMore: false, nextCursor: null, limit: 30 },
      },
    }
    const body = responses[path]
    return route.fulfill({
      status: body ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(body || { error: 'Not found' }),
    })
  })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: /^当前邮箱/ })
  await trigger.click()
  const panel = page.locator('.mailbox-switcher__panel')
  const backdrop = page.locator('.switcher-backdrop')
  const list = page.locator('.mailbox-scope-list')
  await expect(backdrop).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(backdrop).toHaveCSS('backdrop-filter', 'none')
  await expect(trigger).toHaveCSS('z-index', 'auto')
  await expect(panel).toHaveCSS('transform', 'none')
  for (const width of [360, 393, 430]) {
    await page.setViewportSize({ width, height: 800 })
    const panelGeometry = await panel.evaluate((element) => {
      const panel = element.getBoundingClientRect()
      const header = element.querySelector('.switcher-header')?.getBoundingClientRect()
      return {
        panelTop: panel.top,
        panelBottom: panel.bottom,
        headerTop: header?.top || 0,
        headerBottom: header?.bottom || 0,
        viewportHeight: window.innerHeight,
      }
    })
    expect(panelGeometry.panelTop).toBeGreaterThanOrEqual(8)
    expect(panelGeometry.panelBottom).toBeLessThan(panelGeometry.viewportHeight)
    expect(panelGeometry.headerTop).toBeGreaterThanOrEqual(panelGeometry.panelTop)
    expect(panelGeometry.headerBottom).toBeLessThan(panelGeometry.panelBottom)
  }
  const copy = page.getByRole('button', { name: '复制邮箱地址：inbox@example.com' })
  await expect(copy).toBeVisible()
  const listHeightBeforeCopy = await list.evaluate((element) => element.getBoundingClientRect().height)
  const geometry = await copy.evaluate((element) => ({
    copyRight: element.getBoundingClientRect().right,
    rowRight: element.parentElement?.getBoundingClientRect().right || 0,
  }))
  expect(geometry.copyRight).toBeLessThanOrEqual(geometry.rowRight)
  await copy.click()
  const feedback = page.getByRole('status')
  await expect(panel).toHaveAttribute('data-state', 'open')
  await expect(feedback).toHaveText('已复制：inbox@example.com')
  await expect(feedback).toHaveCSS('position', 'absolute')
  expect(await list.evaluate((element) => element.getBoundingClientRect().height)).toBeCloseTo(listHeightBeforeCopy, 1)
  const feedbackGeometry = await feedback.evaluate((element) => {
    const panel = element.parentElement?.getBoundingClientRect()
    const feedback = element.getBoundingClientRect()
    const footer = element.nextElementSibling?.getBoundingClientRect()
    return {
      panelWidth: panel?.width || 0,
      feedbackWidth: feedback.width,
      feedbackBottom: feedback.bottom,
      footerTop: footer?.top || 0,
    }
  })
  expect(feedbackGeometry.feedbackWidth).toBeLessThan(feedbackGeometry.panelWidth - 28)
  expect(feedbackGeometry.feedbackBottom).toBeLessThanOrEqual(feedbackGeometry.footerTop)
  await expect(feedback).toBeHidden({ timeout: 5_000 })
  await expect(trigger).toContainText('所有邮箱')
  expect(await page.evaluate(
    () => localStorage.getItem('omnimail-test-copied'),
  )).toBe('inbox@example.com')
  expect(await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true)
})
