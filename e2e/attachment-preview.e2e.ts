import { expect, type Route, test } from '@playwright/test'
import { message, user } from './omnimail-fixtures'

function json(route: Route, body: unknown) {
  return route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

test('previews PDF and image attachments while unsupported files stay downloads', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const requestUrl = new URL(route.request().url())
    const { pathname } = requestUrl
    if (pathname === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: false,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '',
      mailRefreshInterval: 30, remoteImagesEnabled: false,
      unassignedMailEnabled: false, superAdminEmail: user.email,
      setupRequirements: {
        databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false,
      },
    })
    if (pathname === '/api/session') return json(route, { user })
    if (pathname === '/api/mailboxes') return json(route, { mailboxes: [{
      address: 'inbox@example.com', domain: 'example.com',
      isPrimary: true, isActive: true,
    }] })
    if (pathname === '/api/domains') return json(route, { domains: [] })
    if (pathname === '/api/drafts') return json(route, { drafts: [], limit: 5 })
    if (pathname === '/api/messages/message-1') return json(route, {
      message: {
        ...message, messageId: null, inReplyTo: null, references: null,
        cc: [], text: 'Attachment examples', html: '',
        attachmentCount: 3,
        attachments: [
          {
            id: 'pdf-1', filename: 'plan.pdf', contentType: 'application/pdf',
            size: 4096, contentId: null, disposition: 'attachment',
          },
          {
            id: 'image-1', filename: 'photo.png', contentType: 'image/png',
            size: 68, contentId: null, disposition: 'attachment',
          },
          {
            id: 'svg-1', filename: 'active.svg', contentType: 'image/svg+xml',
            size: 1024, contentId: null, disposition: 'attachment',
          },
        ],
      },
      thread: [message],
    })
    if (pathname === '/api/messages') return json(route, {
      unchanged: false, version: 1, messages: [{ ...message, attachmentCount: 3 }],
      counts: { unread: 0, starred: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    if (pathname.endsWith('/attachments/image-1') && requestUrl.searchParams.get('preview') === '1') {
      return route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      })
    }
    if (pathname.endsWith('/attachments/pdf-1') && requestUrl.searchParams.get('preview') === '1') {
      return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4' })
    }
    return route.fulfill({ status: 500, body: `Unhandled route: ${requestUrl}` })
  })

  await page.goto('/')
  await page.getByText('Welcome to OmniMail').click()

  await page.getByRole('button', { name: '预览附件：plan.pdf' }).click()
  const pdfDialog = page.getByRole('dialog')
  await expect(pdfDialog).toBeVisible()
  await expect(pdfDialog.locator('iframe')).toHaveAttribute(
    'src',
    '/api/messages/message-1/attachments/pdf-1?preview=1',
  )
  await expect(pdfDialog.getByRole('link', { name: '下载附件' })).toHaveAttribute(
    'href',
    '/api/messages/message-1/attachments/pdf-1',
  )
  await page.keyboard.press('Escape')
  await expect(pdfDialog).toBeHidden()

  await page.getByRole('button', { name: '预览附件：photo.png' }).click()
  const previewImage = page.getByRole('dialog').getByRole('img', { name: 'photo.png' })
  await expect(previewImage).toBeVisible()
  await expect.poll(() => previewImage.evaluate((image) => (
    (image as HTMLImageElement).naturalWidth
  ))).toBe(1)
  await page.getByRole('dialog').getByRole('button', { name: '关闭' }).last().click()

  const unsupported = page.locator('a.attachment-card', { hasText: 'active.svg' })
  await expect(unsupported).toHaveAttribute(
    'href',
    '/api/messages/message-1/attachments/svg-1',
  )
})
