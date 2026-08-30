import { expect, type Route, test } from '@playwright/test'
import { message, user } from './omnimail-fixtures'

function json(route: Route, body: unknown) {
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
}

test('an older folder request is aborted before it can replace the current inbox', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })

  let releaseStarred = () => {}
  let markStarredStarted = () => {}
  const starredHeld = new Promise<void>((resolve) => { releaseStarred = resolve })
  const starredStarted = new Promise<void>((resolve) => { markStarredStarted = resolve })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: false,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '', mailRefreshInterval: 30,
      remoteImagesEnabled: false, unassignedMailEnabled: false, superAdminEmail: user.email,
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (url.pathname === '/api/session') return json(route, { user })
    if (url.pathname === '/api/mailboxes') return json(route, { mailboxes: [{
      address: 'inbox@example.com', domain: 'example.com', isPrimary: true, isActive: true,
    }] })
    if (url.pathname === '/api/domains') return json(route, { domains: [] })
    if (url.pathname === '/api/messages') {
      const starred = url.searchParams.get('folder') === 'starred'
      if (starred) {
        markStarredStarted()
        await starredHeld
      }
      return json(route, {
        unchanged: false, version: 1,
        messages: [{ ...message, id: starred ? 'starred-only' : message.id,
          subject: starred ? 'Starred only' : message.subject, isStarred: starred }],
        counts: { unread: 1, starred: 1, drafts: 0, sent: 0, trash: 0 },
        page: { hasMore: false, nextCursor: null, limit: 30 },
      })
    }
    return json(route, { error: `Unhandled test route: ${request.method()} ${url.pathname}` })
  })

  await page.goto('/')
  await expect(page.getByText(message.subject)).toBeVisible()
  await page.getByRole('button', { name: '星标邮件' }).click()
  await starredStarted
  await expect(page.getByText('正在读取邮件')).toBeVisible()

  const staleRequestAborted = page.waitForEvent('requestfailed', (request) => {
    const url = new URL(request.url())
    return url.pathname === '/api/messages' && url.searchParams.get('folder') === 'starred'
  })
  await page.getByRole('button', { name: '收件箱' }).click()
  await staleRequestAborted
  await expect(page.getByRole('heading', { name: '收件箱' })).toBeVisible()
  await expect(page.getByText(message.subject)).toBeVisible()

  releaseStarred()
  await expect(page.getByText(message.subject)).toBeVisible()
  await expect(page.getByText('Starred only')).toHaveCount(0)
})
