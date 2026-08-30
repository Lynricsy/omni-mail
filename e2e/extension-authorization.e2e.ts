import { expect, test } from '@playwright/test'
import { user } from './omnimail-fixtures'

const clientId = 'abcdefghijklmnopabcdefghijklmnop'
const redirectUri = `https://${clientId}.chromiumapp.org/omnimail`
const state = 'a'.repeat(43)
const challenge = 'b'.repeat(43)
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

function authorizationPath(): string {
  const search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return `/extension/authorize?${search}`
}

test('website login continues to extension consent and approval', async ({ page }) => {
  let authorizationBody: Record<string, string> | null = null
  await page.addInitScript(() => localStorage.setItem('omnimail-locale', 'zh-CN'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(config) })
    }
    if (path === '/api/session') {
      return route.fulfill({ contentType: 'application/json', body: '{"user":null}' })
    }
    if (path === '/api/login') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user }) })
    }
    if (path === '/api/auth/extension/authorize') {
      authorizationBody = request.postDataJSON() as Record<string, string>
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ redirectTo: `${new URL(request.url()).origin}/authorized` }),
      })
    }
    return route.fulfill({ status: 404 })
  })

  await page.goto(authorizationPath())
  await expect(page.getByRole('heading', { name: '授权浏览器扩展' })).toBeVisible()
  await expect(page.getByText('iCloud 隐藏邮箱')).toBeVisible()
  await expect(page.getByText('已连接的第三方邮箱')).toBeVisible()
  await expect(page.getByText('密码不会提供给扩展')).toBeVisible()
  await page.getByRole('button', { name: '登录并继续' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('登录邮箱').fill('owner@example.com')
  await dialog.getByLabel('密码').fill('correct horse battery staple')
  await dialog.getByRole('button', { name: '登录', exact: true }).click()

  await expect(page.getByText('owner@example.com')).toBeVisible()
  await expect(page.getByRole('button', { name: '允许访问' })).toBeEnabled()
  await page.getByRole('button', { name: '允许访问' }).click()
  await expect.poll(() => authorizationBody).toEqual({
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  })
})

test('invalid extension callback is rejected before login', async ({ page }) => {
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
  const invalid = new URL(authorizationPath(), 'https://mail.example')
  invalid.searchParams.set('redirect_uri', 'https://attacker.example/callback')
  await page.goto(`${invalid.pathname}${invalid.search}`)
  await expect(page.getByRole('heading', { name: '授权请求无效' })).toBeVisible()
  await expect(page.getByRole('button', { name: '登录并继续' })).toHaveCount(0)
})
