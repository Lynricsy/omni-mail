import { expect, type Route, test } from '@playwright/test'
import { user } from './omnimail-fixtures'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

test('a new version directs the administrator to update their fork on GitHub', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: false,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '',
      mailRefreshInterval: 30, remoteImagesEnabled: false,
      unassignedMailEnabled: false, superAdminEmail: user.email,
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (path === '/api/session') return json(route, { user })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/drafts') return json(route, { drafts: [], limit: 5 })
    if (path === '/api/messages') return json(route, {
      unchanged: false, version: 1, messages: [],
      counts: { unread: 0, starred: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    if (path === '/api/admin/version' && request.method() === 'GET') return json(route, {
      currentVersion: '0.1.0', latestVersion: '0.2.0', updateAvailable: true,
      checkFailed: false, checkedAt: Date.now(),
      releaseRepository: 'mibgb65-cloud/OmniMail',
      releaseUrl: 'https://github.com/mibgb65-cloud/OmniMail/releases/latest',
    })
    return json(route, { error: `Unhandled test route: ${request.method()} ${path}` }, 404)
  })

  await page.goto('/admin/settings')
  await expect(page.getByRole('link', { name: '在 GitHub 查看 v0.2.0' })).toHaveAttribute(
    'href',
    'https://github.com/mibgb65-cloud/OmniMail/releases/latest',
  )
  await expect(page.getByText(
    '请在自己的 Fork 页面选择 Sync fork → Update branch；同步后由 Cloudflare 重新部署。',
  )).toBeVisible()
  await expect(page.getByRole('button', { name: /更新到 v/ })).toHaveCount(0)
})
