import { expect, type Route, test } from '@playwright/test'
import { message, user } from './omnimail-fixtures'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

test('adds attachments to a quick reply and submits them as multipart data', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: true,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '',
      mailRefreshInterval: 30, remoteImagesEnabled: false,
      unassignedMailEnabled: false, superAdminEmail: user.email,
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (path === '/api/session') return json(route, { user })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [{
      address: 'inbox@example.com', domain: 'example.com', isPrimary: true, isActive: true,
    }] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/drafts' && request.method() === 'GET') {
      return json(route, { drafts: [], limit: 5 })
    }
    if (path === '/api/messages/message-1/reply' && request.method() === 'POST') {
      return json(route, { message: { id: 'reply-2', status: 'processing' } }, 202)
    }
    if (path === '/api/messages/message-1') return json(route, {
      message: {
        ...message, messageId: '<message-1@example.net>', inReplyTo: null,
        references: null, cc: [], text: 'Original message', html: '', attachments: [],
      },
      thread: [message],
    })
    if (path === '/api/messages') return json(route, {
      unchanged: false, version: 1, messages: [message],
      counts: { unread: 0, starred: 0, drafts: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    return json(route, { error: `Unhandled test route: ${request.method()} ${path}` }, 404)
  })

  await page.goto('/')
  await page.getByText('Welcome to OmniMail').click()
  await page.getByRole('button', { name: '回复', exact: true }).click()
  const composer = page.locator('.reply-composer')
  await expect(composer.getByRole('button', { name: '添加附件' })).toBeVisible()
  await composer.getByLabel('选择附件').setInputFiles([
    { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('image') },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') },
  ])

  await expect(composer.getByText('photo.png')).toBeVisible()
  await expect(composer.getByText('notes.txt')).toBeVisible()
  await expect(composer.getByText('2/5 · 10 B')).toBeVisible()
  expect(await composer.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return rect.left >= 0 && rect.right <= innerWidth
  })).toBe(true)

  await composer.getByLabel('回复内容').fill('Please see the attached files.')
  const replyRequest = page.waitForRequest((request) => (
    new URL(request.url()).pathname === '/api/messages/message-1/reply'
      && request.method() === 'POST'
  ))
  await composer.getByRole('button', { name: '发送回复' }).click()
  const request = await replyRequest
  expect(request.headers()['content-type']).toContain('multipart/form-data; boundary=')
  const multipart = request.postDataBuffer()?.toString('utf8') ?? ''
  expect(multipart).toContain('Please see the attached files.')
  expect(multipart).toContain('filename="photo.png"')
  expect(multipart).toContain('filename="notes.txt"')
})
