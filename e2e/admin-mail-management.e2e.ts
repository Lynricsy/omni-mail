import { expect, type Page, type Route, test } from '@playwright/test'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

const owner = {
  id: 'owner-1', email: 'owner@example.com', displayName: 'Owner', role: 'super_admin',
  mailboxLimit: 100, storageQuotaBytes: 0, storageUsedBytes: 0,
  canCreateMailboxes: true, canReply: true, canTranslate: true, temporaryExpiresAt: null,
}

const userOwner = { id: 'user-2', email: 'person@example.com', displayName: 'Person' }
const pageReadyTimeout = 10_000

function summary(folder: 'inbox' | 'trash') {
  return {
    id: 'admin-message-1', mailboxAddress: 'contact@example.com', sizeBytes: 2048,
    owner: userOwner, direction: 'incoming', status: 'ready', folder,
    senderName: 'External Sender', senderAddress: 'sender@example.net',
    recipients: ['contact@example.com'], subject: 'Private project update',
    preview: 'This belongs to another user.', date: Date.now(), attachmentCount: 0,
    isRead: false, isStarred: true, processingError: null, deliveryStatus: null,
    purgeAfter: folder === 'trash' ? Date.now() + 86400000 : null,
  } as const
}

async function mockAdminMail(page: Page, role: 'super_admin' | 'admin' = 'super_admin') {
  const state = {
    folder: 'inbox' as 'inbox' | 'trash',
    visible: true,
    actions: [] as string[],
    personalUpdates: 0,
    proxiedImageSource: '',
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
      appName: 'OmniMail', setupComplete: true, replyEnabled: false,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '', mailRefreshInterval: 0,
      remoteImagesEnabled: true, unassignedMailEnabled: false, superAdminEmail: owner.email,
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (path === '/api/session') return json(route, { user: { ...owner, role } })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/messages') return json(route, {
      unchanged: false, version: 1, messages: [],
      counts: { unread: 0, starred: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    if (path.startsWith('/api/messages/') && request.method() === 'PATCH') {
      state.personalUpdates += 1
      return json(route, { ok: true })
    }
    if (path === '/api/admin/messages' && request.method() === 'GET') return json(route, {
      messages: state.visible ? [summary(state.folder)] : [],
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    if (path === '/api/admin/messages/admin-message-1' && request.method() === 'GET') {
      return json(route, {
        message: {
          ...summary(state.folder), messageId: null, inReplyTo: null, references: null,
          cc: [], text: 'Administrative read-only body.',
          html: '<p>Administrative read-only body.</p><img class="admin-remote-image" src="https://assets.example.net/admin.png" alt="Remote admin asset">',
          attachments: [],
        },
        thread: [summary(state.folder)],
      })
    }
    if (path === '/api/admin/messages/bulk' && request.method() === 'PATCH') {
      const input = request.postDataJSON() as { action: 'trash' | 'restore' | 'delete' }
      state.actions.push(input.action)
      if (input.action === 'trash') state.folder = 'trash'
      if (input.action === 'restore') state.folder = 'inbox'
      if (input.action === 'delete') state.visible = false
      return json(route, { ok: true, updatedCount: 1 })
    }
    if (path === '/api/remote-images') {
      state.proxiedImageSource = new URL(request.url()).searchParams.get('url') ?? ''
      return route.fulfill({
        contentType: 'image/gif',
        body: Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64'),
      })
    }
    return json(route, { error: `Unhandled ${request.method()} ${path}` }, 404)
  })
  return state
}

test('owner can inspect and manage another user message without changing read state', async ({ page }) => {
  const state = await mockAdminMail(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/admin/mail')

  await expect(page.getByRole('heading', { name: '邮件管理' }))
    .toBeVisible({ timeout: pageReadyTimeout })
  await expect(page.getByText('person@example.com')).toBeVisible()
  await page.getByRole('button', { name: 'Private project update' }).click()
  const backdrop = page.locator('.admin-mail-drawer-backdrop')
  const dialog = page.getByRole('dialog', { name: '全站邮件详情' })
  const messageFrame = page.frameLocator('.admin-mail-drawer iframe')
  await expect(backdrop).toHaveAttribute('data-state', 'open')
  await expect(messageFrame.locator('body')).toContainText('Administrative read-only body.')
  await expect(dialog).toContainText('Person')
  await expect.poll(() => state.proxiedImageSource).toBe('https://assets.example.net/admin.png')
  await expect.poll(() => messageFrame.locator('.admin-remote-image').evaluate((image) => (
      (image as HTMLImageElement).naturalWidth
    ))).toBe(1)
  expect(state.personalUpdates).toBe(0)
  await dialog.getByRole('button', { name: '关闭' }).click()
  await expect(backdrop).toHaveAttribute('data-state', 'closing')
  await expect(backdrop).toHaveCount(0)
  await page.getByRole('button', { name: 'Private project update' }).click()
  await page.getByRole('dialog', { name: '全站邮件详情' })
    .getByRole('button', { name: '移入垃圾箱' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '移入垃圾箱' }).click()
  await expect.poll(() => state.actions).toEqual(['trash'])

  await page.getByLabel('选择邮件：Private project update').check()
  await page.getByRole('button', { name: '永久删除' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('备份副本仍会按系统保留策略保存。')
  await page.getByRole('alertdialog').getByRole('button', { name: '永久删除' }).click()
  await expect.poll(() => state.actions).toEqual(['trash', 'delete'])
  await expect(page.getByText('当前筛选范围内没有邮件。')).toBeVisible()
})

test('ordinary administrator cannot see or deep-link to mail management', async ({ page }) => {
  await mockAdminMail(page, 'admin')
  await page.goto('/admin/mail')

  await expect(page).toHaveURL(/\/mail\/inbox$/)
  await expect(page.getByRole('button', { name: '邮件管理' })).toHaveCount(0)
})

test('mail management stays within a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await mockAdminMail(page)
  await page.goto('/admin/mail')

  await expect(page.getByRole('heading', { name: '邮件管理' }))
    .toBeVisible({ timeout: pageReadyTimeout })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})
