import { expect, type Page, type Route, test } from '@playwright/test'
import { apiEndpoints } from '../src/features/api-guide/model/apiCatalog'

function json(route: Route, body: unknown) {
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockApiGuide(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: true,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '', mailRefreshInterval: 0,
      remoteImagesEnabled: false, unassignedMailEnabled: false, superAdminEmail: 'owner@example.com',
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (path === '/api/session') return json(route, { user: {
      id: 'owner-1', email: 'owner@example.com', displayName: 'Owner', role: 'super_admin',
      mailboxLimit: 100, storageQuotaBytes: 0, storageUsedBytes: 0,
      canCreateMailboxes: true, canReply: true, canTranslate: true,
      temporaryExpiresAt: null,
    } })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/messages') return json(route, {
      messages: [], counts: { unread: 0, starred: 0, drafts: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 }, version: 1,
    })
    return json(route, {})
  })
}

test('API reference keeps scrolling inside the workspace', async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1152 })
  await mockApiGuide(page)
  await page.goto('/settings/api')

  await expect(page.getByRole('heading', { name: '完整 API 参考' }))
    .toBeVisible({ timeout: 20_000 })
  await expect(page.locator('details.api-endpoint-card'))
    .toHaveCount(apiEndpoints.length, { timeout: 20_000 })
  const shell = page.locator('.admin-scroll-shell')
  await shell.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(page.getByText('/api/admin/version', { exact: true })).toBeVisible()

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY))
    .toBe('hidden')
})
