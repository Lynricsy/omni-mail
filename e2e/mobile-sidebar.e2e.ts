import { expect, test } from '@playwright/test'
import { message, user } from './omnimail-fixtures'

test('mobile navigation keeps six primary items and expands administrator tools upward', async ({ page }) => {
  let sessionRole: 'super_admin' | 'user' = 'super_admin'
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
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
      '/api/session': { user: { ...user, role: sessionRole } },
      '/api/mailboxes': { mailboxes: [{
        address: 'inbox@example.com', domain: 'example.com',
        isPrimary: true, isActive: true,
      }] },
      '/api/domains': { domains: [{
        name: 'example.com', isActive: true, mailboxCount: 1,
        createdAt: 1, updatedAt: 1,
      }] },
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

  await page.setViewportSize({ width: 393, height: 800 })
  await page.goto('/')
  const sidebar = page.locator('.mail-sidebar')
  const primaryMetrics = () => sidebar.evaluate((element) => {
    const buttons = [...element.querySelectorAll<HTMLElement>('.folder-nav > button, .account-nav > button')]
    const rects = buttons.map((button) => button.getBoundingClientRect())
    return {
      count: buttons.length,
      widthDelta: Math.max(...rects.map((rect) => rect.width)) - Math.min(...rects.map((rect) => rect.width)),
      topDelta: Math.max(...rects.map((rect) => rect.top)) - Math.min(...rects.map((rect) => rect.top)),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })

  for (const width of [360, 393, 430]) {
    await page.setViewportSize({ width, height: 800 })
    const metrics = await primaryMetrics()
    expect(metrics.count).toBe(6)
    expect(metrics.widthDelta).toBeLessThanOrEqual(3)
    expect(metrics.topDelta).toBeLessThanOrEqual(1)
    expect(metrics.pageOverflow).toBe(false)
  }

  const toggle = sidebar.locator('.admin-nav-toggle')
  const adminNav = page.locator('.admin-nav')
  await expect(toggle).toHaveAttribute('aria-label', '展开管理员功能')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(adminNav).toHaveCSS('visibility', 'hidden')
  expect(await adminNav.evaluate((element) => getComputedStyle(element).transitionDuration
    .split(',').some((duration) => Number.parseFloat(duration) > 0))).toBe(true)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(toggle).toHaveAttribute('aria-label', '收起管理员功能')
  await expect(adminNav).toHaveCSS('visibility', 'visible')
  await expect(adminNav).toHaveCSS('transform', 'none')
  await expect(adminNav.getByRole('button')).toHaveCount(6)
  const expandedGeometry = await Promise.all([
    sidebar.evaluate((element) => element.getBoundingClientRect().top),
    adminNav.evaluate((element) => element.getBoundingClientRect().bottom),
  ])
  expect(expandedGeometry[1]).toBeLessThan(expandedGeometry[0])
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toHaveAttribute('aria-label', '展开管理员功能')
  await expect(adminNav).toHaveCSS('visibility', 'hidden')

  sessionRole = 'user'
  await page.reload()
  await expect(page.getByRole('button', { name: '展开管理员功能' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '管理员功能' })).toHaveCount(0)
  expect((await primaryMetrics()).count).toBe(6)
})
