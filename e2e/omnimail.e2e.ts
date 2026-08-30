import { expect, type Page, type Route, test } from '@playwright/test'
import { beginMessageRowDrag, endMessageRowDrag, moveMessageRowDrag } from './drag-selection'
import { message, reply, user } from './omnimail-fixtures'
type MockState = {
  messageRequests: number; conditionalRequests: number; sentCount: number
  failed: boolean
  version: number
  messageVisible: boolean
  refreshInterval: number
  subject: string
  adminUserStatus: 'active' | 'disabled'
  authorized: boolean
  createdInviteRole: 'user' | 'temporary' | null
  unassignedMailEnabled: boolean
  messages: Array<typeof message>
  replyEnabled: boolean
  hasMailbox: boolean
  sentMessage: Record<string, string> | null
}
function mockState(refreshInterval = 30, subject = message.subject): MockState {
  return {
    messageRequests: 0, sentCount: 0,
    conditionalRequests: 0,
    failed: true,
    version: 1,
    messageVisible: true,
    refreshInterval,
    subject,
    adminUserStatus: 'active',
    authorized: true,
    createdInviteRole: null,
    unassignedMailEnabled: false,
    messages: [message],
    replyEnabled: false,
    hasMailbox: true,
    sentMessage: null,
  }
}
function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}
async function mockApp(page: Page, state = mockState()) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: state.replyEnabled,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '', mailRefreshInterval: state.refreshInterval,
      remoteImagesEnabled: false, unassignedMailEnabled: state.unassignedMailEnabled, iCloudWorkspaceEnabled: true, linuxDoMailWorkspaceEnabled: true,
      superAdminEmail: user.email,
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (path === '/api/session') return json(route, { user })
    if (path === '/api/logout' && request.method() === 'POST') {
      return json(route, { ok: true })
    }
    if (path === '/api/mailboxes') return json(route, { mailboxes: state.hasMailbox ? [
      { address: 'inbox@example.com', domain: 'example.com', isPrimary: true, isActive: true }, ...(state.replyEnabled ? [{ address: 'support@other.example', domain: 'other.example', isPrimary: false, isActive: true }] : []),
    ] : [] })
    if (path === '/api/domains') return json(route, { domains: [
      { name: 'example.com', isActive: true, mailboxCount: 1, createdAt: 1, updatedAt: 1 },
    ] })
    if (path === '/api/drafts' && request.method() === 'GET') return json(route, { drafts: [], limit: 5 })
    if (path === '/api/drafts' && request.method() === 'POST') { state.sentMessage = request.postDataJSON() as Record<string, string>; return json(route, { draft: { id: 'draft-1', ...state.sentMessage, createdAt: 1, updatedAt: 1, attachments: [] } }) }
    if (path === '/api/drafts/draft-1' && request.method() === 'PUT') { state.sentMessage = request.postDataJSON() as Record<string, string>; return json(route, { draft: { id: 'draft-1', ...state.sentMessage, createdAt: 1, updatedAt: 1, attachments: [] } }) }
    if (path === '/api/drafts/draft-1/send' && request.method() === 'POST') { state.sentCount += 1; state.version += 1; return json(route, { message: { id: `sent-${state.sentCount}`, status: 'queued' } }, 202) }
    if (path === '/api/messages/message-1' && request.method() === 'PATCH') {
      const input = request.postDataJSON() as { folder?: string }
      if (input.folder === 'trash') state.messageVisible = false
      state.version += 1
      return json(route, { ok: true })
    }
    if (path === '/api/messages/message-1' && request.method() === 'GET') return json(route, {
      message: {
        ...message, messageId: '<message-1@example.net>', inReplyTo: null, references: null,
        cc: [], text: 'Visit https://example.com',
        html: '<div data-email-canvas style="width:100%;background:#f5f0e8"><table role="presentation" width="100%"><tr><td><div style="width:640px;min-width:640px"><p><a href="https://example.com/account">Visit account</a></p></div></td></tr></table></div>', attachments: [],
      },
      thread: [message, reply],
    })
    if (path === '/api/messages/reply-1') return json(route, {
      message: {
        ...reply, messageId: null, inReplyTo: '<message-1@example.net>',
        references: '<message-1@example.net>', cc: [], text: 'Thanks from OmniMail.',
        html: '', attachments: [],
      },
      thread: [message, reply],
    })
    if (path === '/api/messages/bulk' && request.method() === 'PATCH') {
      const input = request.postDataJSON() as { ids: string[]; action: string }
      if (input.action === 'trash' || input.action === 'delete') state.messageVisible = false
      state.version += 1
      return json(route, { ok: true, updatedCount: input.ids.length })
    }
    if (path === '/api/messages') {
      if (!state.authorized) return json(route, { error: '请先登录。' }, 401)
      state.messageRequests += 1
      const requestedVersion = url.searchParams.get('version')
      if (requestedVersion !== null) state.conditionalRequests += 1
      if (requestedVersion === String(state.version)) {
        return json(route, { unchanged: true, version: state.version })
      }
      return json(route, {
        unchanged: false, version: state.version,
        messages: state.messageVisible
          ? state.messages.map((item, index) => (
              index === 0 ? { ...item, subject: state.subject } : item
            ))
          : [],
        counts: { unread: 0, starred: 0, drafts: 0, sent: 0, trash: 0 },
        page: { hasMore: false, nextCursor: null, limit: 30 },
      })
    }
    if (path === '/api/admin/statistics') return json(route, {
      days: 30, generatedAt: Math.floor(Date.now() / 1000),
      summary: { totalReceived: 1, periodReceived: 1, todayReceived: 1, uniqueSenders: 1 },
      daily: Array.from({ length: 30 }, (_, index) => ({ day: 1_700_000_000 + index * 86400,
        count: index === 29 ? 1 : 0 })),
      sourceDomains: [{ domain: 'example.net', count: 1 }],
      topSenders: [{ address: 'sender@example.net', name: 'Example Sender', count: 1 }],
      platform: {
        refreshInterval: 30,
        workerRequests: { estimatedPerVisibleTab: 2880, dailyLimit: 100000 },
        d1RowsRead: { estimatedPerVisibleTab: 89280, dailyLimit: 5000000 },
        queueOperations: { estimatedToday: 3, dailyLimit: 10000 },
        r2Storage: { estimatedPrimaryBytes: 2048, freeBytes: 10 * 1024 ** 3 },
      },
      storage: {
        messageCount: 1, usedBytes: 2048, attachmentCount: 0, attachmentBytes: 0,
        trashCount: 0, trashBytes: 0, failedCount: state.failed ? 1 : 0,
        failedBytes: state.failed ? 2048 : 0, userCount: 1,
        quotaBytes: 5 * 1024 ** 3, quotaUsedBytes: 2048, unlimitedUsers: 0,
        byUser: [], byMailbox: [],
      },
    })
    if (path === '/api/admin/failed-messages' && request.method() === 'GET') {
      return json(route, state.failed ? { total: 1, messages: [{
        id: 'failed-1', mailboxAddress: 'inbox@example.com', senderName: '',
        senderAddress: 'broken@example.net', subject: 'Broken MIME', error: 'MIME parse failed',
        attempts: 3, lastFailedAt: Date.now(), size: 2048, canRetry: true,
      }] } : { total: 0, messages: [] })
    }
    if (path === '/api/admin/failed-messages/failed-1/retry' && request.method() === 'POST') {
      state.failed = false
      return json(route, { ok: true })
    }
    if (path === '/api/admin/settings/unassigned-mail' && request.method() === 'PATCH') {
      const input = request.postDataJSON() as { enabled: boolean }
      state.unassignedMailEnabled = input.enabled
      return json(route, { unassignedMailEnabled: input.enabled })
    }
    if (path === '/api/admin/users' && request.method() === 'GET') {
      return json(route, {
        users: [{
          id: 'managed-user-1',
          email: 'test11@snipxn.com',
          displayName: 'Test User',
          role: 'temporary',
          status: state.adminUserStatus,
          mailboxLimit: 1,
          mailboxCount: 1,
          storageQuotaBytes: 1024 ** 3,
          storageUsedBytes: 2048,
          canCreateMailboxes: false,
          canReply: false, canTranslate: true,
          temporaryExpiresAt: Math.floor(Date.now() / 1000) + 25 * 60 * 60,
          createdAt: 1_700_000_000,
          updatedAt: 1_700_000_000,
        }],
        totals: {
          total: 1,
          active: state.adminUserStatus === 'active' ? 1 : 0,
          disabled: state.adminUserStatus === 'disabled' ? 1 : 0,
        },
        page: { hasMore: false, nextCursor: null, limit: 50 },
      })
    }
    if (path === '/api/admin/users/managed-user-1' && request.method() === 'PATCH') {
      const input = request.postDataJSON() as {
        status: 'active' | 'disabled'
        role: 'admin' | 'user' | 'temporary'
        mailboxLimit: number
        storageQuotaMiB: number
        canCreateMailboxes: boolean
        canReply: boolean; canTranslate: boolean
      }
      state.adminUserStatus = input.status
      return json(route, {
        user: {
          id: 'managed-user-1',
          email: 'test11@snipxn.com',
          displayName: 'Test User',
          role: input.role,
          status: input.status,
          mailboxLimit: input.mailboxLimit,
          mailboxCount: 1,
          storageQuotaBytes: input.storageQuotaMiB * 1024 ** 2,
          storageUsedBytes: 2048,
          canCreateMailboxes: input.canCreateMailboxes,
          canReply: input.canReply, canTranslate: input.canTranslate,
          temporaryExpiresAt: Math.floor(Date.now() / 1000) + 25 * 60 * 60,
          createdAt: 1_700_000_000,
          updatedAt: 1_700_000_001,
        },
      })
    }
    if (path === '/api/admin/invites' && request.method() === 'GET') {
      return json(route, {
        invites: [{
          id: 'invite-1',
          domain: 'example.com',
          accountRole: 'temporary',
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
          multiUse: false,
          useCount: 0,
          addressMode: 'self_selected',
          assignedAddress: null,
          accountLifetimeHours: 24,
          mailboxLimit: 1,
          canCreateMailboxes: false,
          canReply: false, canTranslate: false,
          createdAt: Math.floor(Date.now() / 1000),
          state: 'active',
        }],
        page: { hasMore: false, nextCursor: null, limit: 30 },
      })
    }
    if (path === '/api/admin/invites' && request.method() === 'POST') {
      const input = request.postDataJSON() as { accountRole: 'user' | 'temporary'; canTranslate: boolean }
      state.createdInviteRole = input.accountRole
      return json(route, {
        invite: {
          id: 'invite-2',
          domain: 'example.com',
          accountRole: input.accountRole,
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
          multiUse: false,
          useCount: 0,
          addressMode: 'self_selected',
          assignedAddress: null,
          accountLifetimeHours: input.accountRole === 'temporary' ? 24 : null,
          mailboxLimit: 1,
          canCreateMailboxes: false,
          canReply: false, canTranslate: input.canTranslate,
          createdAt: Math.floor(Date.now() / 1000),
          state: 'active',
        },
        token: 'regular-invite-token',
      }, 201)
    }
    if (path === '/api/admin/invites/invite-1/revoke' && request.method() === 'PATCH') {
      return json(route, { ok: true })
    }
    if (path === '/api/admin/version') return json(route, { currentVersion: '0.1.0', latestVersion: '0.2.0', updateAvailable: true, checkFailed: false, checkedAt: Date.now(), releaseUrl: 'https://github.com/mibgb65-cloud/OmniMail/releases/latest', releaseRepository: 'mibgb65-cloud/OmniMail' })
    return json(route, { error: `Unhandled test route: ${request.method()} ${path}` }, 500)
  })
  return state
}
test('reselecting the inbox quietly refreshes without hiding the list', async ({ page }) => {
  const state = await mockApp(page); await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: /^当前邮箱/ })
  const triggerHeight = await trigger.evaluate((element) => element.getBoundingClientRect().height)
  await trigger.click(); const panel = page.locator('.mailbox-switcher__panel')
  await expect(panel).toHaveAttribute('data-state', 'open'); await expect.poll(() => trigger.evaluate((element) => element.getBoundingClientRect().height)).toBe(triggerHeight)
  await trigger.click(); await expect(panel).toHaveAttribute('data-state', 'closing')
  await expect(panel).toHaveCount(0)
  await expect(page.getByText('Welcome to OmniMail')).toBeVisible()
  const requestsBeforeReselect = state.messageRequests
  await page.getByRole('button', { name: '收件箱', exact: true }).click()
  await expect.poll(() => state.messageRequests).toBeGreaterThan(requestsBeforeReselect)
  await expect(page.getByText('Welcome to OmniMail')).toBeVisible()
  await expect(page.getByText('正在读取邮件')).toHaveCount(0)
})
test('email links open the safety dialog instead of navigating the iframe', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 }); await mockApp(page); await page.goto('/')
  await page.getByText('Welcome to OmniMail').click(); expect(await page.locator('.message-reader').evaluate(() => [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).filter((rule): rule is CSSKeyframesRule => rule instanceof CSSKeyframesRule && rule.name === 'message-reader-in').every((rule) => [...rule.cssRules].every((frame) => !frame.style.transform)))).toBe(true)
  for (const width of [320, 360, 393, 430]) { await page.setViewportSize({ width, height: 700 }); await expect.poll(() => page.frameLocator('iframe').locator('body').evaluate((body) => { const viewportWidth = body.ownerDocument.documentElement.clientWidth; const canvas = body.querySelector('[data-email-canvas]')?.getBoundingClientRect(); return [...body.querySelectorAll('*')].every((element) => { const rect = element.getBoundingClientRect(); return rect.left >= -1 && rect.right <= viewportWidth + 2 }) && Boolean(canvas && canvas.right >= viewportWidth - 4) })).toBe(true) }
  const link = page.frameLocator('iframe').getByRole('link', { name: 'Visit account' })
  await link.click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('example.com')
  await expect(dialog.getByRole('button', { name: '复制链接' })).toBeVisible()
  await expect(page).toHaveURL('http://127.0.0.1:4173/mail/inbox')
})
test('users can apply a bulk action to selected messages', async ({ page }) => {
  await mockApp(page)
  await page.goto('/')
  await expect(page.getByRole('checkbox', { name: '选择邮件：Welcome to OmniMail' })).toHaveCount(0)
  await page.getByRole('button', { name: '批量操作' }).click()
  await page.getByRole('checkbox', { name: '选择邮件：Welcome to OmniMail' }).check()
  await page.getByRole('button', { name: '移入垃圾箱' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('您可以在自动清理前恢复')
  await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused()
  await dialog.getByRole('button', { name: '取消' }).click()
  await expect(page.getByText('Welcome to OmniMail')).toBeVisible()
  await page.getByRole('button', { name: '移入垃圾箱' }).click()
  await dialog.getByRole('button', { name: '移入垃圾箱' }).click()
  await expect(page.getByText('这里还是空的')).toBeVisible()
})
test('users can compose and send a new message', async ({ page }) => {
  const state = mockState(); state.replyEnabled = true
  await page.setViewportSize({ width: 1280, height: 800 }); await page.emulateMedia({ colorScheme: 'dark' }); await mockApp(page, state)
  await page.goto('/'); await page.getByRole('button', { name: '新建邮件' }).click()
  const dialog = page.getByRole('dialog', { name: '新建邮件' })
  const geometry = await dialog.evaluate((element) => { const rect = element.getBoundingClientRect(); const editor = element.querySelector('textarea')!.getBoundingClientRect(); return { rightGap: innerWidth - rect.right, bottomGap: innerHeight - rect.bottom, editorHeight: editor.height } })
  expect(geometry.rightGap).toBeLessThanOrEqual(32); expect(geometry.bottomGap).toBeLessThanOrEqual(32); expect(geometry.editorHeight).toBeGreaterThan(280)
  const from = dialog.getByRole('combobox', { name: '发件人' }); await expect(from).toContainText('inbox@example.com')
  await from.click(); const otherMailbox = dialog.getByRole('option', { name: /support@other\.example/ })
  await expect(otherMailbox).toBeVisible(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
  const recipient = dialog.getByRole('textbox', { name: '收件人', exact: true }); await expect(recipient).toHaveCSS('border-top-width', '0px')
  await recipient.fill('friend@example.net'); await recipient.press('Enter'); await recipient.fill('team@example.org'); await recipient.press('Enter'); await expect(dialog.getByText('team@example.org', { exact: true })).toBeVisible()
  await dialog.getByLabel('主题').fill('Hello from OmniMail')
  await dialog.getByLabel('邮件正文').fill('This is a new message.')
  await dialog.getByRole('button', { name: '发送邮件' }).click()
  await expect(dialog).toBeHidden(); expect(state.sentMessage).toMatchObject({ mailboxAddress: 'support@other.example',
    to: 'friend@example.net, team@example.org', subject: 'Hello from OmniMail', text: 'This is a new message.' })
  await expect(page.getByRole('status').filter({ hasText: '邮件已进入发送队列' })).toHaveText('邮件已进入发送队列'); await page.getByRole('button', { name: '新建邮件' }).click(); const secondDialog = page.getByRole('dialog', { name: '新建邮件' }); await secondDialog.getByRole('textbox', { name: '收件人', exact: true }).fill('second@example.net'); await secondDialog.getByLabel('主题').fill('Second message'); await secondDialog.getByLabel('邮件正文').fill('Second body'); await secondDialog.getByRole('button', { name: '发送邮件' }).click(); await expect(secondDialog).toBeHidden(); expect(state.sentCount).toBe(2); await expect(page.locator('#root')).not.toBeEmpty()
})
test('a user with an empty mailbox allowance is prompted to choose an address', async ({ page }) => {
  const state = mockState()
  state.hasMailbox = false
  await mockApp(page, state)
  await page.goto('/')
  const dialog = page.getByRole('dialog', { name: '管理邮箱地址' })
  const domainSelect = dialog.getByRole('combobox', { name: '邮箱域名' })
  await domainSelect.press('ArrowDown')
  await expect(page.getByRole('option', { name: 'example.com', exact: true })).toBeFocused()
})
test('dragging across message rows quickly selects and deselects a range', async ({ page }) => {
  const state = mockState()
  state.messages = [message,
    { ...message, id: 'message-2', subject: 'Second message', senderName: 'Second Sender' },
    { ...message, id: 'message-3', subject: 'Third message', senderName: 'Third Sender' },
  ]
  await mockApp(page, state)
  await page.goto('/')
  await beginMessageRowDrag(page, 0)
  await moveMessageRowDrag(page, 2)
  await expect(page.locator('.message-row.is-checked')).toHaveCount(3)
  await moveMessageRowDrag(page, 1)
  await expect(page.locator('.message-row.is-checked')).toHaveCount(2)
  await expect(page.locator('.message-row.is-checked', { hasText: 'Third message' })).toHaveCount(0)
  await endMessageRowDrag(page)
})
test('single-message deletion requires confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await mockApp(page)
  await page.goto('/')
  await page.getByText('Welcome to OmniMail').click()
  await expect(page.locator('.sender-avatar')).toHaveCSS('color', 'rgb(255, 255, 255)')
  await page.getByRole('button', { name: '移入垃圾箱' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading')).toHaveText('将这封邮件移入垃圾箱？')
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true)
  await dialog.getByRole('button', { name: '取消' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to OmniMail' })).toBeVisible()
  await page.getByRole('button', { name: '移入垃圾箱' }).click()
  await dialog.getByRole('button', { name: '移入垃圾箱' }).click()
  await expect(page.getByText('这里还是空的')).toBeVisible()
})
test('permanent bulk deletion explains that it cannot be undone', async ({ page }) => {
  await mockApp(page)
  await page.goto('/')
  await page.getByRole('button', { name: '垃圾箱' }).click()
  await page.getByRole('button', { name: '批量操作' }).click()
  await page.getByRole('checkbox', { name: '选择邮件：Welcome to OmniMail' }).check()
  await page.getByRole('button', { name: '永久删除所选邮件' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('此操作无法撤销')
  await expect(dialog.getByRole('button', { name: '永久删除' })).toBeVisible()
})
test('bulk controls remain usable at common responsive widths', async ({ page }) => {
  const state = await mockApp(page)
  state.messages = Array.from({ length: 12 }, (_, index) => ({ ...message,
    id: `message-${index + 1}`, subject: index === 0 ? message.subject : `Message ${index + 1}` }))
  const [toolbar, list] = [page.locator('.bulk-toolbar'), page.locator('.message-list')]
  await page.goto('/')
  const layout = await list.evaluate((element) => {
    const toolbarElement = element.previousElementSibling as HTMLElement
    return { listTop: element.getBoundingClientRect().top,
      toolbarBottom: toolbarElement.getBoundingClientRect().bottom,
      gutter: getComputedStyle(element).scrollbarGutter,
      scrollbar: getComputedStyle(element).scrollbarColor, width: element.clientWidth }
  })
  expect(layout.listTop).toBeCloseTo(layout.toolbarBottom, 1); expect(layout.gutter).toContain('stable')
  await list.hover(); expect(await list.evaluate((element) => element.clientWidth)).toBe(layout.width)
  await expect.poll(() => list.evaluate((element) => getComputedStyle(element).scrollbarColor)).not.toBe(layout.scrollbar)
  await page.locator('.list-header').hover(); await list.evaluate((element) => { element.scrollTop = 80 })
  await expect(list).toHaveClass(/is-scrollbar-active/); await page.getByRole('button', { name: '回到列表顶部：收件箱' }).click()
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0); const [idleHeight, requestsBefore] = [await toolbar.evaluate((element) => element.getBoundingClientRect().height), state.messageRequests]
  await expect(page.locator('.message-row__check')).toHaveCount(12)
  await page.getByRole('button', { name: '批量操作' }).click()
  await expect.poll(() => toolbar.evaluate((element) => element.getBoundingClientRect().height)).toBe(idleHeight)
  expect(state.messageRequests).toBe(requestsBefore)
  await page.getByRole('checkbox', { name: '选择邮件：Welcome to OmniMail' }).check()
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByRole('button', { name: '移入垃圾箱' })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    if (width === 375) expect(await page.locator('.mail-sidebar').evaluate((nav) => [nav.scrollWidth <= nav.clientWidth, nav.querySelectorAll('.folder-nav > button, .account-nav > button').length])).toEqual([true, 8])
  }
})
test('long subjects wrap to two stable lines without horizontal overflow', async ({ page }) => {
  const subject = 'Secure link to log in to Claude.ai | 2026-07-28 09:52:24'
  await page.setViewportSize({ width: 375, height: 900 })
  await mockApp(page, mockState(30, subject))
  await page.goto('/')
  const title = page.locator('.message-row__subject-text')
  await expect(title).toHaveText(subject)
  const metrics = await title.evaluate((element) => {
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight)
    return {
      height: element.getBoundingClientRect().height,
      lineHeight,
      scrollHeight: element.scrollHeight,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
  expect(metrics.height).toBeGreaterThan(metrics.lineHeight * 1.5)
  expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight * 2.1)
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.height + 1)
  expect(metrics.pageOverflow).toBe(false)
  await expect(page.locator('.message-row__main')).toHaveAttribute('data-tooltip', subject)
})
test('tooltips finish their exit animation before unmounting', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await mockApp(page)
  await page.goto('/')
  await page.getByRole('button', { name: '刷新邮件' }).hover()
  const tooltip = page.locator('.omni-tooltip')
  await expect(tooltip).toHaveAttribute('data-state', 'open')
  await page.evaluate(() => {
    const events: string[] = []
    ;(window as typeof window & { __tooltipExitEvents?: string[] }).__tooltipExitEvents = events
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof HTMLElement) {
          events.push(record.target.dataset.state || '')
        }
        if (record.type === 'childList' && [...record.removedNodes].some((node) => (
          node instanceof Element && node.matches('.omni-tooltip')
        ))) {
          events.push('removed')
        }
      }
    }).observe(document.body, {
      attributes: true,
      attributeFilter: ['data-state'],
      childList: true,
      subtree: true,
    })
  })
  await page.locator('.search-field').hover()
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & { __tooltipExitEvents?: string[] }).__tooltipExitEvents
  ))).toEqual(['closing', 'removed'])
})
test('related messages are available as a conversation thread', async ({ page }) => {
  await mockApp(page)
  await page.goto('/')
  await page.getByText('Welcome to OmniMail').click()
  await expect(page.getByText('会话中 2 封邮件')).toBeVisible()
  await page.getByRole('button', { name: /发给 sender@example.net/ }).click()
  await expect(page.locator('.plain-body')).toHaveText('Thanks from OmniMail.')
})
test('visible tabs share one automatic refresh leader', async ({ page, context }) => {
  const state = mockState(5)
  await mockApp(page, state)
  const secondPage = await context.newPage()
  await mockApp(secondPage, state)
  await Promise.all([page.goto('/'), secondPage.goto('/')])
  await expect(page.getByText('Welcome to OmniMail')).toBeVisible()
  await expect(secondPage.getByText('Welcome to OmniMail')).toBeVisible()
  await secondPage.bringToFront()
  await expect.poll(() => secondPage.evaluate(() => document.visibilityState)).toBe('visible')
  await secondPage.waitForTimeout(800)
  const before = state.conditionalRequests
  await expect.poll(
    () => state.conditionalRequests - before,
    { timeout: 9000 },
  ).toBe(1)
})
test('administrators can review usage estimates and retry failed mail', async ({ page }) => {
  await mockApp(page)
  await page.goto('/')
  await page.getByRole('button', { name: '统计' }).click()
  await expect(page.getByRole('heading', { name: 'Cloudflare 免费额度参考' })).toBeVisible(); const trendPoint = page.locator('.statistics-point').last(); await expect(trendPoint).toHaveAttribute('tabindex', '0'); await trendPoint.scrollIntoViewIfNeeded(); await expect(trendPoint).toBeInViewport(); await trendPoint.hover(); const trendTooltip = page.locator('.omni-tooltip'); await expect(trendTooltip).toHaveAttribute('data-state', 'open'); await expect(trendTooltip).toContainText('1 封')
  await expect(page.getByText('Broken MIME')).toBeVisible()
  await page.getByRole('button', { name: '重新处理' }).click()
  await expect(page.getByText('当前没有失败邮件')).toBeVisible()
})
test('workspace navigation has durable URLs and browser history', async ({ page }) => {
  await mockApp(page); await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const mailTransition = page.locator('.page-content-enter'); await expect(mailTransition).toHaveCSS('animation-name', 'page-content-settle')
  expect(await mailTransition.evaluate(() => [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).filter((rule): rule is CSSKeyframesRule => rule instanceof CSSKeyframesRule && rule.name === 'page-content-settle').every((rule) => [...rule.cssRules].every((frame) => !frame.style.opacity)))).toBe(true)
  const firstMessage = page.locator('.message-row').first(); await expect(firstMessage).toHaveCSS('animation-name', 'message-row-settle'); await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(firstMessage).toHaveCSS('animation-name', 'none'); await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page).toHaveURL(/\/mail\/inbox$/)
  await page.getByRole('button', { name: '用户' }).click()
  await expect(page.locator('.admin-workspace')).toHaveCSS('animation-name', 'page-content-settle')
  await expect(page).toHaveURL(/\/admin\/users$/)
  await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible()
  await page.getByRole('button', { name: '系统设置' }).click()
  await expect(page).toHaveURL(/\/admin\/settings$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/admin\/users$/)
  await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(/\/admin\/settings$/)
  await page.goto('/admin/invites')
  await expect(page.getByRole('heading', { name: '邀请管理' })).toBeVisible()
})
test('an expired or disabled session returns to the public home page', async ({ page }) => {
  const state = await mockApp(page)
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible()
  state.authorized = false
  await page.getByRole('button', { name: '收件箱' }).click()
  await expect(page).toHaveURL('http://127.0.0.1:4173/')
  await expect(page.getByRole('button', { name: '进入邮箱' })).toBeVisible()
  await expect(page.getByText('test11@snipxn.com')).toHaveCount(0)
})
test('disabling a user uses the in-app safety dialog', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 }); await mockApp(page); await page.goto('/')
  await page.getByRole('button', { name: '展开管理员功能' }).click(); await page.getByRole('button', { name: '用户' }).click(); await expect(page.locator('.managed-user-list .temporary-user-expiry')).toContainText('剩余 1 天 1 小时')
  await page.getByRole('button', { name: /Test User/ }).click()
  const policyBackdrop = page.locator('.user-policy-backdrop'); const policyPanel = page.locator('.user-panel')
  await expect(policyBackdrop).toHaveAttribute('data-state', 'open'); await expect(policyBackdrop).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)'); await expect(policyBackdrop).toHaveCSS('backdrop-filter', 'none'); await expect(policyPanel).toHaveCSS('transition-property', 'opacity, transform'); await expect(policyPanel).toHaveCSS('transform', 'none')
  await expect(policyPanel.locator('.temporary-user-expiry')).toContainText('剩余 1 天 1 小时'); await policyPanel.getByRole('button', { name: '关闭' }).click()
  await expect(policyBackdrop).toHaveCount(0); await page.getByRole('button', { name: /Test User/ }).click()
  await page.getByRole('checkbox', { name: /封禁账户/ }).check()
  await page.getByRole('button', { name: '保存权限' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading')).toHaveText('封禁 test11@snipxn.com？')
  await expect(dialog).toContainText('所有现有会话都将失效')
  await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused()
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true)
  await dialog.getByRole('button', { name: '取消' }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: '保存权限' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '确认封禁' }).click()
  await expect(page.getByText('账户已封禁')).toBeVisible()
})
test('invitation lifecycle has a dedicated responsive admin page', async ({ page }) => {
  await mockApp(page)
  await page.goto('/')
  await page.getByRole('button', { name: '邀请' }).click()
  await expect(page.getByRole('heading', { name: '邀请管理' })).toBeVisible()
  await expect(page.getByLabel('邀请概况')).toContainText('邀请记录')
  await expect(page.getByRole('heading', { name: '最近邀请' })).toBeVisible()
  await expect(page.locator('.invite-card')).toHaveCount(1)
  const expiry = page.locator('.invite-expiry')
  await expect(expiry).toHaveCSS('white-space', 'nowrap')
  await page.getByRole('button', { name: '撤销' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('已经创建的账号不会受到影响')
  await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused()
  await dialog.getByRole('button', { name: '确认撤销' }).click()
  await expect(page.getByText('已撤销')).toBeVisible()
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => (
      document.documentElement.scrollWidth <= document.documentElement.clientWidth
    ))).toBe(true)
  }
})
test('administrators can generate regular user invitation links', async ({ page }) => {
  const state = await mockApp(page)
  await page.goto('/admin/invites')
  await page.getByRole('radio', { name: /^普通用户/ }).click()
  await expect(page.getByLabel('临时账号有效时间')).toHaveCount(0)
  await page.getByRole('button', { name: '生成邀请链接' }).click()
  await expect.poll(() => state.createdInviteRole).toBe('user')
  await expect(page.getByLabel('新邀请链接')).toHaveValue(/invite=regular-invite-token/)
  await expect(page.locator('.invite-card').first()).toContainText('普通用户')
  await expect(page.locator('.invite-card').first()).toContainText('长期有效')
})
test('administrators can enable unassigned mail from system settings', async ({ page }) => {
  const state = await mockApp(page)
  await page.goto('/admin/settings')
  await page.getByRole('checkbox', { name: '开启无人收件' }).click()
  await expect.poll(() => state.unassignedMailEnabled).toBe(true)
  await expect(page.getByText('无人收件已开启')).toBeVisible()
  await expect(page.getByRole('main').getByText('发现新版本 v0.2.0')).toBeVisible()
})
