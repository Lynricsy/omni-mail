import { expect, type Page, type Route, test } from '@playwright/test'
import { message, reply, user } from './omnimail-fixtures'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockFailedMessage(page: Page) {
  let retried = false
  const failed = {
    ...message,
    direction: 'outgoing',
    status: 'failed',
    folder: 'sent',
    senderName: 'Owner',
    senderAddress: 'inbox@example.com',
    recipients: ['friend@example.net'],
    subject: 'Failed delivery',
    processingError: 'API key is invalid',
    deliveryStatus: 'failed',
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: true,
      registrationEnabled: false, registrationAvailable: false, registrationMethod: 'password',
      linuxDoLoginEnabled: false, registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '', mailRefreshInterval: 30,
      remoteImagesEnabled: false, unassignedMailEnabled: false, superAdminEmail: user.email,
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (path === '/api/session') return json(route, { user })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [
      { address: 'inbox@example.com', domain: 'example.com', isPrimary: true, isActive: true },
    ] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/messages/message-1' && request.method() === 'PATCH') return json(route, { ok: true })
    if (path === '/api/messages/message-1') return json(route, {
      message: { ...failed, status: retried ? 'processing' : 'failed',
        processingError: retried ? null : failed.processingError,
        deliveryStatus: retried ? 'queued' : 'failed', messageId: null, inReplyTo: null,
        references: null, cc: [], text: 'Please retry this message.', html: '', attachments: [] },
      thread: [failed, reply],
    })
    if (path === '/api/admin/failed-messages/message-1/retry' && request.method() === 'POST') {
      retried = true
      return json(route, { ok: true })
    }
    if (path === '/api/messages') return json(route, {
      unchanged: false, version: retried ? 2 : 1,
      messages: [{ ...failed, status: retried ? 'processing' : 'failed',
        processingError: retried ? null : failed.processingError,
        deliveryStatus: retried ? 'queued' : 'failed' }],
      counts: { unread: 0, starred: 0, sent: 1, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    return json(route, { error: `Unhandled route: ${request.method()} ${path}` }, 500)
  })
  return () => retried
}

test('administrators can retry a failed outgoing message from its details', async ({ page }) => {
  const wasRetried = await mockFailedMessage(page)
  await page.goto('/')
  await page.getByText('Failed delivery').click()
  const retry = page.getByRole('button', { name: '重新发送' })
  await expect(retry).toBeVisible()
  await expect(page.getByText('发送失败：API key is invalid')).toBeVisible()
  await retry.click()
  await expect.poll(wasRetried).toBe(true)
  await expect(page.getByText('邮件已进入发送队列，系统正在可靠投递。')).toBeVisible()
  await expect(page.getByRole('button', { name: '重新发送' })).toHaveCount(0)
})
