import { expect, type Route, test } from '@playwright/test'
import { user } from './omnimail-fixtures'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

test('the super administrator can start an exact release update', async ({ page }) => {
  let requestedVersion = ''
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**/api/**', async (route) => {
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
      automaticUpdate: true, automaticUpdateReason: null, checkFailed: false,
      checkedAt: Date.now(), releaseRepository: 'mibgb65-cloud/OmniMail',
      releaseUrl: 'https://github.com/mibgb65-cloud/OmniMail/releases/latest',
    })
    if (path === '/api/admin/version/update' && request.method() === 'POST') {
      requestedVersion = request.postDataJSON().targetVersion
      return json(route, { build: {
        id: '11111111-1111-4111-8111-111111111111',
        targetVersion: '0.2.0', state: 'queued',
      } }, 202)
    }
    if (path === '/api/admin/version/update/11111111-1111-4111-8111-111111111111') {
      return json(route, { build: {
        id: '11111111-1111-4111-8111-111111111111', state: 'running',
      } })
    }
    return json(route, { error: `Unhandled test route: ${request.method()} ${path}` }, 404)
  })

  await page.goto('/admin/settings')
  await page.getByRole('button', { name: '更新到 v0.2.0' }).click()
  const confirmation = page.getByRole('alertdialog', { name: '确认系统更新' })
  await expect(confirmation).toContainText('Release Tag 对应的确切提交')
  await confirmation.getByRole('button', { name: '开始更新' }).click()
  await expect.poll(() => requestedVersion).toBe('0.2.0')
  await expect(page.getByText('正在构建并部署…')).toBeVisible()
})
