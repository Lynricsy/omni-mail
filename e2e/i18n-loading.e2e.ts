import { expect, test } from '@playwright/test'

test('loads the English catalog before rendering localized features', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('omnimail-locale', 'en-US'))
  await page.route('**://*/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const body = path === '/api/config'
      ? {
          appName: 'OmniMail',
          setupComplete: true,
          replyEnabled: false,
          registrationEnabled: false,
          registrationAvailable: false,
          registrationMethod: 'linuxdo',
          linuxDoLoginEnabled: true,
          registrationDomainPolicy: { mode: 'blocklist', domains: [] },
          registrationProtectionReady: false,
          turnstileSiteKey: '',
          mailRefreshInterval: 30,
          remoteImagesEnabled: false,
          unassignedMailEnabled: false,
          iCloudWorkspaceEnabled: false,
          linuxDoMailWorkspaceEnabled: false,
          gmailWorkspaceEnabled: false,
          microsoftWorkspaceEnabled: false,
          qqMailWorkspaceEnabled: false,
          superAdminEmail: 'owner@example.com',
          setupRequirements: {
            databaseReady: true,
            storageReady: true,
            queueReady: true,
            superAdminReady: true,
            setupTokenReady: true,
          },
        }
      : path === '/api/session' ? { user: null } : { error: 'Not found' }
    await route.fulfill({
      status: path === '/api/config' || path === '/api/session' ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', {
    name: 'Bring every domain into one focused inbox.',
  })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).first().click()
  await expect(page.getByRole('button', { name: 'Continue with Linux DO' })).toBeVisible()
})
