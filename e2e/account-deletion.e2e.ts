import { expect, type Page, type Route, test } from '@playwright/test'

type AccountRole = 'admin' | 'user'

function json(route: Route, body: unknown) {
  return route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function mockAccountPage(page: Page, role: AccountRole) {
  let deletion: Record<string, string> | null = null
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail',
      setupComplete: true,
      replyEnabled: false,
      registrationEnabled: false,
      registrationAvailable: false,
      registrationMethod: 'password',
      linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false,
      turnstileSiteKey: '',
      mailRefreshInterval: 0,
      remoteImagesEnabled: false,
      unassignedMailEnabled: false,
      superAdminEmail: 'owner@example.com',
      setupRequirements: {
        databaseReady: true,
        storageReady: true,
        queueReady: true,
        superAdminReady: true,
        setupTokenReady: false,
      },
    })
    if (path === '/api/session') return json(route, { user: {
      id: `${role}-1`,
      email: `${role}@example.com`,
      displayName: role === 'user' ? 'Regular User' : 'Administrator',
      role,
      mailboxLimit: 1,
      storageQuotaBytes: 1024 ** 3,
      storageUsedBytes: 0,
      canCreateMailboxes: false,
      canReply: false,
      canTranslate: true,
      temporaryExpiresAt: null,
    } })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/messages') return json(route, {
      unchanged: false,
      version: 1,
      messages: [],
      counts: { unread: 0, starred: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    if (path === '/api/account' && request.method() === 'DELETE') {
      deletion = request.postDataJSON() as Record<string, string>
      return json(route, { ok: true })
    }
    return route.abort()
  })
  return () => deletion
}

test('regular users can delete their account with email confirmation', async ({ page }) => {
  const deletion = await mockAccountPage(page, 'user')
  await page.goto('/settings/account')
  await page.getByRole('button', { name: '注销我的账号' }).click()
  const dialog = page.getByRole('alertdialog', { name: '确认注销账号' })
  await dialog.getByLabel('输入当前登录邮箱确认').fill('user@example.com')
  await dialog.getByRole('button', { name: '确认注销账号' }).click()
  await expect.poll(deletion).toEqual({ confirmationEmail: 'user@example.com' })
})

test('administrators do not receive a self-service account deletion entry', async ({ page }) => {
  await mockAccountPage(page, 'admin')
  await page.goto('/settings/account')
  await expect(page.getByRole('button', { name: '注销我的账号' })).toHaveCount(0)
})
