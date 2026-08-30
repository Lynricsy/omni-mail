import { expect, type Page, type Route, test } from '@playwright/test'

function json(route: Route, body: unknown) {
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockEmptyICloud(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: false, iCloudEnabled: true,
      iCloudWorkspaceEnabled: true, linuxDoMailWorkspaceEnabled: true,
      registrationEnabled: false, registrationAvailable: false, registrationMethod: 'password',
      linuxDoLoginEnabled: false, registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '', mailRefreshInterval: 0,
      remoteImagesEnabled: false, unassignedMailEnabled: false, superAdminEmail: '',
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (path === '/api/session') return json(route, { user: {
      id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
      mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
      canCreateMailboxes: false, canReply: false, canTranslate: false,
      temporaryExpiresAt: null,
    } })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/icloud/accounts') return json(route, { accounts: [] })
    return route.abort()
  })
}

test('regular users can open iCloud from the mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await mockEmptyICloud(page)
  await page.goto('/mail/inbox')

  await page.getByRole('button', { name: 'iCloud 邮箱' }).click()
  await expect(page).toHaveURL(/\/icloud$/)
  await expect(page.getByRole('heading', { name: 'iCloud', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '个人账户' })
    .getByRole('button', { name: '账号设置' })).toBeVisible()
})
