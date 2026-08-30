import { expect, test } from '@playwright/test'

const config = {
  appName: 'OmniMail',
  setupComplete: true,
  replyEnabled: false,
  registrationEnabled: false,
  registrationAvailable: false,
  registrationMethod: 'password',
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
}

test('password login continues with an administrator TOTP challenge', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('omnimail-locale', 'zh-CN'))
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(config) })
    }
    if (path === '/api/session') {
      return route.fulfill({ contentType: 'application/json', body: '{"user":null}' })
    }
    if (path === '/api/login' && request.method() === 'POST') {
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: '{"mfaRequired":true,"email":"owner@example.com"}',
      })
    }
    if (path === '/api/login/mfa') {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"error":"验证码或恢复码不正确。"}',
      })
    }
    return route.fulfill({ status: 404 })
  })

  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('登录邮箱').fill('owner@example.com')
  await dialog.getByLabel('密码').fill('correct horse battery staple')
  await dialog.getByRole('button', { name: '登录', exact: true }).click()

  await expect(dialog.getByRole('heading', { name: '完成二次验证' })).toBeVisible()
  await dialog.getByLabel('验证码或恢复码').fill('000000')
  await dialog.getByRole('button', { name: '验证并登录' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('验证码或恢复码不正确。')
})

test('Linux DO can return directly to the pending TOTP challenge', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('omnimail-locale', 'zh-CN'))
  await page.route('**://*/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/config') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(config) })
    }
    if (path === '/api/session') {
      return route.fulfill({ contentType: 'application/json', body: '{"user":null}' })
    }
    return route.fulfill({ status: 404 })
  })

  await page.goto('/?mfa_required=1')
  await expect(page.getByRole('dialog').getByRole('heading', {
    name: '完成二次验证',
  })).toBeVisible()
})
