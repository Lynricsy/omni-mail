import { expect, test } from '@playwright/test'

test('Linux DO-only registration starts OAuth without showing a password form', async ({ page }) => {
  let authorizationUrl = ''
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('omnimail-locale', 'zh-CN'))
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/config') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          appName: 'OmniMail',
          setupComplete: true,
          replyEnabled: false,
          registrationEnabled: true,
          registrationAvailable: true,
          registrationMethod: 'linuxdo',
          linuxDoLoginEnabled: true,
          registrationDomainPolicy: { mode: 'blocklist', domains: [] },
          registrationProtectionReady: false,
          turnstileSiteKey: '',
          mailRefreshInterval: 30,
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
        }),
      })
    }
    if (url.pathname === '/api/session') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      })
    }
    if (url.pathname === '/api/auth/linux-do') {
      authorizationUrl = request.url()
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ status: 404 })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '创建账户', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: '通过 Linux DO 创建账户' })).toBeVisible()
  await expect(dialog.locator('footer')).toHaveCSS('align-items', 'center')
  await expect(dialog.getByLabel('登录邮箱')).toHaveCount(0)
  await expect(dialog.getByLabel('密码')).toHaveCount(0)
  await dialog.getByRole('button', { name: '通过 Linux DO 创建账户' }).click()
  await expect.poll(() => authorizationUrl).toContain('/api/auth/linux-do')
  expect(new URL(authorizationUrl).searchParams.get('returnTo')).toBe(
    page.url(),
  )
})
