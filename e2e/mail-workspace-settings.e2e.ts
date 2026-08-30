import { expect, test, type Page, type Route } from '@playwright/test'
import { user } from './omnimail-fixtures'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockWorkspaceSettings(page: Page) {
  const state = {
    iCloudWorkspaceEnabled: true,
    linuxDoMailWorkspaceEnabled: true,
    gmailWorkspaceEnabled: true,
    microsoftWorkspaceEnabled: true,
    qqMailWorkspaceEnabled: true,
    naverMailWorkspaceEnabled: true,
    yandexMailWorkspaceEnabled: true,
  }
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: false, iCloudEnabled: false,
      ...state, registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '', mailRefreshInterval: 30,
      remoteImagesEnabled: false, unassignedMailEnabled: false,
      officialExtensionEnabled: false, randomMailboxPrefix: '', superAdminEmail: user.email,
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (path === '/api/session') return json(route, { user })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/messages') return json(route, {
      unchanged: false, version: 0, messages: [],
      counts: { unread: 0, starred: 0, drafts: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    if (path === '/api/admin/settings/mail-workspaces' && request.method() === 'PATCH') {
      Object.assign(state, request.postDataJSON())
      return json(route, state)
    }
    return json(route, { error: 'Not mocked' }, 404)
  })
  return state
}

test('system settings control optional mailbox workspace entries', async ({ page }) => {
  const state = await mockWorkspaceSettings(page)
  await page.goto('/admin/settings')
  const deploymentLaunch = page.getByRole('button', { name: /部署初始化向导/ })
  await expect(deploymentLaunch).toHaveCSS('display', 'flex')
  await expect(deploymentLaunch).toHaveCSS('border-radius', '12px')
  expect((await deploymentLaunch.boundingBox())!.height).toBeGreaterThanOrEqual(58)
  expect(await deploymentLaunch.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true)
  const settings = page.locator('.mail-workspace-settings')
  const iCloudSwitch = settings.getByRole('checkbox', { name: 'iCloud 隐藏邮箱入口' })
  const linuxDoSwitch = settings.getByRole('checkbox', { name: 'Linux DO 邮箱入口' })
  const microsoftSwitch = settings.getByRole('checkbox', { name: 'Microsoft 邮箱入口' })
  const qqMailSwitch = settings.getByRole('checkbox', { name: 'QQ 邮箱入口' })
  const yandexMailSwitch = settings.getByRole('checkbox', { name: 'Yandex 邮箱入口' })

  await expect(iCloudSwitch).toBeChecked()
  await expect(linuxDoSwitch).toBeChecked()
  await expect(microsoftSwitch).toBeChecked()
  await expect(qqMailSwitch).toBeChecked()
  await expect(yandexMailSwitch).toBeChecked()
  await iCloudSwitch.uncheck()
  await expect.poll(() => state.iCloudWorkspaceEnabled).toBe(false)
  await expect(page.getByRole('button', { name: 'iCloud 邮箱' })).toHaveCount(0)
  await linuxDoSwitch.uncheck()
  await expect.poll(() => state.linuxDoMailWorkspaceEnabled).toBe(false)
  await expect(page.getByRole('button', { name: 'Linux DO 邮箱' })).toHaveCount(0)
  await microsoftSwitch.uncheck()
  await expect.poll(() => state.microsoftWorkspaceEnabled).toBe(false)
  await expect(page.getByRole('button', { name: 'Microsoft 邮箱' })).toHaveCount(0)
  await qqMailSwitch.uncheck()
  await expect.poll(() => state.qqMailWorkspaceEnabled).toBe(false)
  await expect(page.getByRole('button', { name: 'QQ 邮箱' })).toHaveCount(0)
  await yandexMailSwitch.uncheck()
  await expect.poll(() => state.yandexMailWorkspaceEnabled).toBe(false)
  await expect(page.getByRole('button', { name: 'Yandex 邮箱' })).toHaveCount(0)

  await page.goto('/settings/account')
  await expect(page.getByRole('button', { name: 'iCloud 邮箱' })).toHaveCount(0)
  await page.goto('/icloud')
  await expect(page).toHaveURL(/\/mail\/inbox$/)
  await page.goto('/linux-do-mail')
  await expect(page).toHaveURL(/\/mail\/inbox$/)
  await page.goto('/microsoft')
  await expect(page).toHaveURL(/\/mail\/inbox$/)
  await page.goto('/qq-mail')
  await expect(page).toHaveURL(/\/mail\/inbox$/)
  await page.goto('/yandex-mail')
  await expect(page).toHaveURL(/\/mail\/inbox$/)

  await page.goto('/admin/settings')
  await settings.getByRole('checkbox', { name: 'iCloud 隐藏邮箱入口' }).check()
  await settings.getByRole('checkbox', { name: 'Linux DO 邮箱入口' }).check()
  await settings.getByRole('checkbox', { name: 'Microsoft 邮箱入口' }).check()
  await settings.getByRole('checkbox', { name: 'QQ 邮箱入口' }).check()
  await settings.getByRole('checkbox', { name: 'Yandex 邮箱入口' }).check()
  await expect(page.getByRole('button', { name: 'iCloud 邮箱' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Linux DO 邮箱' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Microsoft 邮箱' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'QQ 邮箱' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Yandex 邮箱' })).toBeVisible()
})
