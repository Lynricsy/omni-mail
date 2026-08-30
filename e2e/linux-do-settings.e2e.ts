import { expect, test } from '@playwright/test'
import { user } from './omnimail-fixtures'

test('administrator can select Linux DO-only registration in the registration card', async ({ page }) => {
  let selectedMethod = 'password'
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
    if (path === '/api/config') return json({
      appName: 'OmniMail',
      setupComplete: true,
      replyEnabled: false,
      registrationEnabled: false,
      registrationAvailable: false,
      registrationMethod: selectedMethod,
      linuxDoLoginEnabled: true,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: true,
      turnstileSiteKey: 'site-key',
      mailRefreshInterval: 30,
      remoteImagesEnabled: false,
      unassignedMailEnabled: false,
      superAdminEmail: user.email,
      setupRequirements: {
        databaseReady: true,
        storageReady: true,
        queueReady: true,
        superAdminReady: true,
        setupTokenReady: false,
      },
    })
    if (path === '/api/session') return json({ user })
    if (path === '/api/mailboxes') return json({ mailboxes: [] })
    if (path === '/api/domains') return json({ domains: [] })
    if (path === '/api/messages') return json({
      unchanged: false,
      version: 1,
      messages: [],
      counts: { unread: 0, starred: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    if (path === '/api/admin/settings/registration' && request.method() === 'PATCH') {
      const input = request.postDataJSON() as { enabled: boolean; method: string }
      selectedMethod = input.method
      return json({
        registrationEnabled: input.enabled,
        registrationMethod: input.method,
      })
    }
    return route.fulfill({ status: 404 })
  })

  await page.goto('/admin/settings')
  const registrationCard = page.locator('.admin-card').filter({
    has: page.getByRole('heading', { name: '外部注册' }),
  })
  const remoteImagesCard = page.locator('.admin-card').filter({
    has: page.getByRole('heading', { name: '远程图片' }),
  })
  await expect(registrationCard.getByText('注册方式')).toBeVisible()
  await expect(remoteImagesCard.getByText('注册方式')).toHaveCount(0)
  await registrationCard.locator('label').filter({ hasText: '仅 Linux DO' }).click()
  await expect(registrationCard.getByLabel('仅 Linux DO')).toBeChecked()
  await expect(registrationCard.getByText('邮箱后缀规则')).toHaveCount(0)
  expect(selectedMethod).toBe('linuxdo')
})
