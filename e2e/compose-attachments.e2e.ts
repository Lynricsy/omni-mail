import { expect, type Route, test } from '@playwright/test'
import { user } from './omnimail-fixtures'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

test('adds image and document attachments from the compose dialog', async ({ page }) => {
  let upload = 0
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
    if (path === '/api/session') return json(route, {
      user: { ...user, role: 'user', canCreateMailboxes: false },
    })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [{
      address: 'inbox@example.com', domain: 'example.com', isPrimary: true, isActive: true,
    }] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/drafts' && request.method() === 'GET') return json(route, {
      drafts: [], limit: 5,
    })
    if (path === '/api/drafts' && request.method() === 'POST') return json(route, {
      draft: { id: 'draft-1', ...request.postDataJSON(), createdAt: 1, updatedAt: 1, attachments: [] },
    })
    if (path === '/api/drafts/draft-1' && request.method() === 'PUT') return json(route, {
      draft: { id: 'draft-1', ...request.postDataJSON(), createdAt: 1, updatedAt: 1, attachments: [] },
    })
    if (path === '/api/drafts/draft-1/attachments' && request.method() === 'POST') {
      const attachments = [
        { id: 'image-1', filename: 'avatar.png', contentType: 'image/png', size: 68 },
        { id: 'document-1', filename: 'guide.pdf', contentType: 'application/pdf', size: 1536 },
      ]
      return json(route, { attachment: attachments[upload++] }, 201)
    }
    if (path === '/api/messages') return json(route, {
      unchanged: false, version: 1, messages: [],
      counts: { unread: 0, starred: 0, drafts: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    return json(route, { error: `Unhandled test route: ${request.method()} ${path}` }, 404)
  })

  await page.goto('/')
  await page.getByRole('button', { name: '新建邮件' }).click()
  const dialog = page.getByRole('dialog', { name: '新建邮件' })
  await expect(dialog.getByRole('button', { name: '添加附件' })).toBeVisible()
  await dialog.getByLabel('选择附件').setInputFiles([
    { name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from('image') },
    { name: 'guide.pdf', mimeType: 'application/pdf', buffer: Buffer.from('document') },
  ])

  await expect(dialog.getByText('avatar.png')).toBeVisible()
  await expect(dialog.getByText('guide.pdf')).toBeVisible()
  await expect(dialog.getByText('2/5 · 1.6 KiB')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '移除附件：avatar.png' })).toBeVisible()
})
