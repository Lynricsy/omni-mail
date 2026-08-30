import { expect, test } from '@playwright/test'
import { message, user } from './omnimail-fixtures'

test('navigation stays usable on mobile and short desktop viewports', async ({ page }) => {
  let sessionRole: 'super_admin' | 'user' = 'super_admin'
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    const responses: Record<string, unknown> = {
      '/api/config': {
        appName: 'OmniMail', setupComplete: true, replyEnabled: false,
        registrationEnabled: false, registrationAvailable: false,
        registrationMethod: 'password', linuxDoLoginEnabled: false,
        registrationDomainPolicy: { mode: 'blocklist', domains: [] },
        registrationProtectionReady: false, turnstileSiteKey: '',
        iCloudWorkspaceEnabled: true, linuxDoMailWorkspaceEnabled: true,
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
  const navigation = sidebar.locator('.sidebar-navigation')
  const primaryMetrics = () => sidebar.evaluate((element) => {
    const buttons = [...element.querySelectorAll<HTMLElement>('.folder-nav > button, .account-nav > button')]
    const rects = buttons.map((button) => button.getBoundingClientRect())
    return {
      count: buttons.length,
      widthDelta: Math.max(...rects.map((rect) => rect.width)) - Math.min(...rects.map((rect) => rect.width)),
      minWidth: Math.min(...rects.map((rect) => rect.width)),
      topDelta: Math.max(...rects.map((rect) => rect.top)) - Math.min(...rects.map((rect) => rect.top)),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })

  for (const width of [360, 393, 430]) {
    await page.setViewportSize({ width, height: 800 })
    const metrics = await primaryMetrics()
    expect(metrics.count).toBe(8)
    expect(metrics.widthDelta).toBeLessThanOrEqual(3)
    expect(metrics.minWidth).toBeGreaterThanOrEqual(44)
    expect(metrics.topDelta).toBeLessThanOrEqual(1)
    expect(metrics.pageOverflow).toBe(false)
  }
  await expect(navigation).toHaveCSS('display', 'contents')

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

  await page.setViewportSize({ width: 1280, height: 520 })
  const brand = sidebar.locator('.sidebar-brand > .brand')
  await expect(brand).toContainText('OmniMail')
  expect(await brand.evaluate((element) => element.closest('a'))).toBeNull()
  const projectLinks = sidebar.getByRole('navigation', { name: 'OmniMail 项目链接' })
  const repositoryLink = projectLinks.getByRole('link', { name: '打开 OmniMail GitHub 仓库' })
  const websiteLink = projectLinks.getByRole('link', { name: '打开 OmniMail 官网' })
  await expect(repositoryLink).toHaveAttribute(
    'href', 'https://github.com/mibgb65-cloud/OmniMail',
  )
  await expect(websiteLink).toHaveAttribute('href', 'https://omnimail.aicnos.com')
  await expect(repositoryLink).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(websiteLink).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(repositoryLink).toBeVisible()
  await expect(websiteLink).toBeVisible()
  const [brandBox, projectLinksBox, repositoryBox, websiteBox, sidebarBox] = await Promise.all([
    brand.boundingBox(),
    projectLinks.boundingBox(),
    repositoryLink.boundingBox(),
    websiteLink.boundingBox(),
    sidebar.boundingBox(),
  ])
  expect(brandBox).not.toBeNull()
  expect(projectLinksBox).not.toBeNull()
  expect(repositoryBox).not.toBeNull()
  expect(websiteBox).not.toBeNull()
  expect(sidebarBox).not.toBeNull()
  expect(projectLinksBox!.x).toBeGreaterThanOrEqual(brandBox!.x + brandBox!.width)
  expect(Math.abs(projectLinksBox!.y + projectLinksBox!.height / 2
    - brandBox!.y - brandBox!.height / 2)).toBeLessThanOrEqual(2)
  expect(repositoryBox!.width).toBeGreaterThanOrEqual(24)
  expect(websiteBox!.x - repositoryBox!.x - repositoryBox!.width).toBeGreaterThanOrEqual(8)
  expect(websiteBox!.x + websiteBox!.width).toBeLessThanOrEqual(sidebarBox!.x + sidebarBox!.width)
  expect(await sidebar.locator('.folder-nav > button span').allTextContents())
    .toEqual(['收件箱', '星标邮件', '草稿箱', '已发送', '垃圾箱', 'iCloud 邮箱', 'Linux DO 邮箱'])
  await expect(sidebar).toHaveCSS('overflow-y', 'hidden')
  await expect(navigation).toHaveCSS('overflow-y', 'scroll')
  expect(await navigation.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  const fixedBefore = await sidebar.evaluate((element) => ({
    brandTop: element.querySelector('.sidebar-brand')!.getBoundingClientRect().top,
    accountBottom: element.querySelector('.sidebar-account')!.getBoundingClientRect().bottom,
    sidebarScrollTop: element.scrollTop,
  }))
  const scrollbarStyles = async (locator: typeof navigation) => locator.evaluate((element) => ({
    gutter: getComputedStyle(element).scrollbarGutter,
    width: getComputedStyle(element).scrollbarWidth,
  }))
  expect(await scrollbarStyles(navigation)).toEqual(
    await scrollbarStyles(page.locator('.message-list')),
  )
  await navigation.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  await expect(navigation).toHaveClass(/is-scrollbar-active/)
  await expect(sidebar.getByRole('button', { name: '账号设置' })).toBeInViewport()
  const fixedAfter = await sidebar.evaluate((element) => ({
    brandTop: element.querySelector('.sidebar-brand')!.getBoundingClientRect().top,
    accountBottom: element.querySelector('.sidebar-account')!.getBoundingClientRect().bottom,
    sidebarScrollTop: element.scrollTop,
  }))
  expect(Math.abs(fixedAfter.brandTop - fixedBefore.brandTop)).toBeLessThanOrEqual(1)
  expect(Math.abs(fixedAfter.accountBottom - fixedBefore.accountBottom)).toBeLessThanOrEqual(1)
  expect(fixedAfter.sidebarScrollTop).toBe(0)
  await expect(navigation).not.toHaveClass(/is-scrollbar-active/, { timeout: 1_500 })

  await page.setViewportSize({ width: 393, height: 800 })
  sessionRole = 'user'
  await page.reload()
  await expect(page.getByRole('button', { name: '展开管理员功能' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '管理员功能' })).toHaveCount(0)
  expect((await primaryMetrics()).count).toBe(8)
})
