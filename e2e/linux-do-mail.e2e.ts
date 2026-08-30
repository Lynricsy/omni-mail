import { expect, type Page, type Route, test } from '@playwright/test'

function json(route: Route, body: unknown) {
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockLinuxDoMail(page: Page, options: { rejectCredentialUpdate?: boolean } = {}) {
  let account: null | Record<string, unknown> = null
  const connections: Array<{ username: string; password: string }> = []
  const credentialUpdates: Array<{ password: string }> = []
  const searches: Array<{ folder: 'inbox' | 'sent'; query: string }> = []
  const sentMessages: Array<{
    to: string; subject: string; text: string; idempotencyKey: string
  }> = []
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: false,
      iCloudEnabled: false, iCloudWorkspaceEnabled: true, linuxDoMailWorkspaceEnabled: true,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '', mailRefreshInterval: 0,
      remoteImagesEnabled: false, unassignedMailEnabled: false, superAdminEmail: '',
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (path === '/api/session') return json(route, { user: {
      id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
      mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
      canCreateMailboxes: false, canReply: true, canTranslate: false,
      temporaryExpiresAt: null,
    } })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/linux-do-mail/account' && request.method() === 'POST') {
      connections.push(request.postDataJSON())
      account = {
        id: 'linuxdo-mail-1', username: 'member@linux.do', status: 'active',
        lastValidated: '2026-08-22T00:00:00.000Z', lastError: '',
        createdAt: '2026-08-22T00:00:00.000Z', hasPassword: true,
      }
      return json(route, { account })
    }
    if (path === '/api/linux-do-mail/account' && request.method() === 'DELETE') {
      account = null
      return json(route, { ok: true })
    }
    if (path === '/api/linux-do-mail/account') return json(route, { enabled: true, account })
    if (path === '/api/linux-do-mail/account/credential') {
      credentialUpdates.push(request.postDataJSON())
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (options.rejectCredentialUpdate) return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'IMAP 登录失败，请检查新密码或认证令牌。' }),
      })
      return json(route, { account })
    }
    if (path === '/api/linux-do-mail/account/verify') {
      return json(route, { ok: true, validatedAt: '2026-08-22T00:00:00.000Z' })
    }
    if (path === '/api/linux-do-mail/messages') {
      sentMessages.push(request.postDataJSON())
      await new Promise((resolve) => setTimeout(resolve, 100))
      return json(route, { message: { id: 'outbound-1', status: 'processing' } })
    }
    if (path === '/api/linux-do-mail/sent/outbound-1') return json(route, { message: {
      id: 'outbound-1', from: 'member@linux.do', to: 'recipient@example.com',
      subject: '来自 Linux DO 的问候', date: '2026-08-22T00:00:00.000Z',
      preview: '这是一封队列发送测试邮件。', body: '这是一封队列发送测试邮件。',
      html: '<p>这是一封队列发送测试邮件。</p>', isRead: true,
      direction: 'outgoing', status: 'sent', deliveryStatus: 'sent', processingError: '',
    } })
    if (path === '/api/linux-do-mail/sent') {
      const query = url.searchParams.get('q') || ''
      searches.push({ folder: 'sent', query })
      const messages = sentMessages.map(() => ({
      id: 'outbound-1', from: 'member@linux.do', to: 'recipient@example.com',
      subject: '来自 Linux DO 的问候', date: '2026-08-22T00:00:00.000Z',
      preview: '这是一封队列发送测试邮件。', body: '', html: '', isRead: true,
      direction: 'outgoing', status: 'sent', deliveryStatus: 'sent', processingError: '',
      })).filter((message) => !query || JSON.stringify(message).includes(query))
      return json(route, { messages })
    }
    if (path === '/api/linux-do-mail/inbox/42') return json(route, { message: {
      id: '42', from: 'Linux DO <notice@linux.do>', to: 'member@linux.do',
      subject: '欢迎回来', date: '2026-08-22T00:00:00.000Z',
      preview: '完整邮件内容', body: '完整邮件内容',
      html: `<p>完整邮件内容</p>${'<p>Linux DO message details</p>'.repeat(80)}`, isRead: true,
    } })
    if (path === '/api/linux-do-mail/inbox') {
      const query = url.searchParams.get('q') || ''
      searches.push({ folder: 'inbox', query })
      const messages = [{
        id: '42', from: 'Linux DO <notice@linux.do>', to: 'member@linux.do',
        subject: '欢迎回来', date: '2026-08-22T00:00:00.000Z',
        preview: '这是一封测试邮件', body: '', html: '', isRead: false,
      }].filter((message) => !query || JSON.stringify(message).includes(query))
      return json(route, { messages })
    }
    return route.abort()
  })
  return { connections, credentialUpdates, searches, sentMessages }
}

async function openConnectDialog(page: Page) {
  await page.getByRole('button', { name: '连接 Linux DO 邮箱' }).click()
  const dialog = page.getByRole('dialog', { name: '连接 Linux DO 邮箱' })
  await expect(dialog).toHaveClass(/icloud-modal/)
  await expect(dialog.getByLabel('邮箱用户名')).toBeFocused()
  return dialog
}

test('connects a Linux DO mailbox with username and password and reads mail', async ({ page }) => {
  const state = await mockLinuxDoMail(page)
  await page.goto('/linux-do-mail')

  await expect(page.getByRole('button', { name: '回到列表顶部：Linux DO' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '还没有连接 Linux DO 邮箱' })).toBeVisible()
  await expect(page.locator('.reader-pane')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '添加 Linux DO 邮箱账号' })).toBeVisible()
  const connectDialog = await openConnectDialog(page)
  expect(await connectDialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await connectDialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.setViewportSize({ width: 1280, height: 720 })
  await connectDialog.getByLabel('邮箱用户名').fill('member@linux.do')
  const password = connectDialog.getByLabel('密码或认证令牌')
  await password.fill('revocable-test-token')
  await connectDialog.getByRole('button', { name: '显示密码' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await connectDialog.getByRole('button', { name: '验证并连接' }).click()

  await expect.poll(() => state.connections).toEqual([{
    username: 'member@linux.do', password: 'revocable-test-token',
  }])
  await expect(connectDialog).toBeHidden()
  await expect(page.getByText('欢迎回来')).toBeVisible()
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('revocable-test-token')

  const inboxSearch = page.getByRole('search', { name: '搜索收件箱邮件' })
  await inboxSearch.getByRole('searchbox').fill('欢迎')
  await inboxSearch.getByRole('searchbox').press('Enter')
  await expect.poll(() => state.searches).toContainEqual({ folder: 'inbox', query: '欢迎' })
  await expect(page.getByText('欢迎回来')).toBeVisible()
  await inboxSearch.getByRole('searchbox').fill('不存在')
  await inboxSearch.getByRole('searchbox').press('Enter')
  await expect(page.getByRole('heading', { name: '未找到相关邮件' })).toBeVisible()
  await inboxSearch.getByRole('button', { name: '清除搜索' }).click()
  await expect(page.getByText('欢迎回来')).toBeVisible()

  const accountTrigger = page.getByRole('button', { name: '管理 Linux DO 账号' })
  await expect(page.locator('.icloud-header-action-buttons > button')).toHaveCount(4)
  await expect(page.getByRole('button', { name: '复制邮箱地址：member@linux.do' })).toBeVisible()
  await accountTrigger.click()
  const credentialDialog = page.getByRole('dialog', { name: 'Linux DO 账号管理' })
  const verifyButton = credentialDialog.getByRole('button', { name: '立即验证' })
  await expect(verifyButton).toBeFocused()
  await verifyButton.click()
  await expect(page.getByRole('status')).toContainText('账号验证成功')
  const newPassword = credentialDialog.getByLabel('新密码或认证令牌')
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await credentialDialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true)
  await newPassword.fill('rotated-test-token')
  await credentialDialog.getByRole('button', { name: '显示密码' }).click()
  await expect(newPassword).toHaveAttribute('type', 'text')
  await credentialDialog.getByRole('button', { name: '验证并更新' }).click()
  await expect(credentialDialog.locator('.lucide-loader-circle.spin')).toBeVisible()
  await expect(credentialDialog.locator('.lucide-key-round')).toHaveCount(0)
  await expect.poll(() => state.credentialUpdates).toEqual([{ password: 'rotated-test-token' }])
  await expect(credentialDialog).toBeHidden()
  await expect(accountTrigger).toBeFocused()
  await expect(page.getByRole('status')).toContainText('认证令牌已更新')
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('rotated-test-token')

  const composeTrigger = page.getByRole('button', { name: '新建 Linux DO 邮件' })
  await expect(composeTrigger).toHaveClass(/compose-trigger/)
  await composeTrigger.click()
  const composeDialog = page.getByRole('dialog', { name: '新建 Linux DO 邮件' })
  await expect(composeDialog).toHaveClass(/compose-dialog/)
  await expect(composeDialog.getByText('member@linux.do', { exact: true })).toBeVisible()
  await expect(composeDialog.getByLabel('收件人')).toBeFocused()
  expect(await composeDialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true)
  await composeDialog.getByLabel('收件人').fill('recipient@example.com')
  await composeDialog.getByLabel('主题').fill('来自 Linux DO 的问候')
  await composeDialog.getByLabel('正文').fill('这是一封队列发送测试邮件。')
  await composeDialog.getByRole('button', { name: '发送邮件' }).click()
  await expect(composeDialog.locator('.lucide-loader-circle.spin')).toBeVisible()
  await expect(composeDialog.locator('.lucide-send')).toHaveCount(0)
  await expect.poll(() => state.sentMessages).toHaveLength(1)
  expect(state.sentMessages[0]).toMatchObject({
    to: 'recipient@example.com',
    subject: '来自 Linux DO 的问候',
    text: '这是一封队列发送测试邮件。',
  })
  expect(state.sentMessages[0].idempotencyKey).toMatch(/^[a-f0-9]{32}$/)
  await expect(composeDialog).toBeHidden()
  await expect(page.getByRole('status')).toContainText('邮件已加入发送队列')

  const folders = page.locator('.linuxdo-folder-switch')
  await folders.getByRole('button', { name: '已发送' }).click()
  await expect(folders.getByRole('button', { name: '已发送' })).toHaveAttribute('aria-pressed', 'true')
  const sentSearch = page.getByRole('search', { name: '搜索已发送邮件' })
  await sentSearch.getByRole('searchbox').fill('队列')
  await sentSearch.getByRole('searchbox').press('Enter')
  await expect.poll(() => state.searches).toContainEqual({ folder: 'sent', query: '队列' })
  const sentRow = page.locator('.message-row').filter({ hasText: 'recipient@example.com' })
  await expect(sentRow.getByText('已发送', { exact: true })).toBeVisible()
  await sentRow.getByRole('button').click()
  const sentReader = page.locator('.reader-pane')
  await expect(sentReader.frameLocator('iframe')
    .getByText('这是一封队列发送测试邮件。', { exact: true })).toBeVisible()
  await expect(sentReader.getByRole('heading', { name: '已发送邮件' })).toBeVisible()
  await page.getByRole('button', { name: '返回邮件列表' }).click()
  await sentSearch.getByRole('button', { name: '清除搜索' }).click()
  await folders.getByRole('button', { name: '收件箱' }).click()

  await page.getByRole('button', { name: /欢迎回来/ }).click()
  const inboxReader = page.locator('.reader-pane')
  await expect(inboxReader.frameLocator('iframe')
    .getByText('完整邮件内容', { exact: true })).toBeVisible()
  const readerContent = page.locator('.icloud-reader .reader-content')
  await readerContent.evaluate((element) => { element.scrollTop = element.scrollHeight })
  const toolbarSubject = page.getByRole('button', { name: '回到顶部：欢迎回来' })
  const readerScrollTop = page.locator('.icloud-reader .reader-scroll-top')
  await expect(toolbarSubject).toBeVisible()
  await expect(readerScrollTop).toHaveClass(/is-visible/)
  await toolbarSubject.click()
  await expect.poll(() => readerContent.evaluate((element) => element.scrollTop)).toBe(0)
  await readerContent.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await readerScrollTop.click()
  await expect.poll(() => readerContent.evaluate((element) => element.scrollTop)).toBe(0)

  await expect(page.getByRole('button', { name: '返回邮件列表' })).toBeVisible()
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true)
})

test('keeps the credential dialog recoverable after validation fails', async ({ page }) => {
  await mockLinuxDoMail(page, { rejectCredentialUpdate: true })
  await page.goto('/linux-do-mail')
  const connectDialog = await openConnectDialog(page)
  await connectDialog.getByLabel('邮箱用户名').fill('member@linux.do')
  await connectDialog.getByLabel('密码或认证令牌').fill('revocable-test-token')
  await connectDialog.getByRole('button', { name: '验证并连接' }).click()

  const trigger = page.getByRole('button', { name: '管理 Linux DO 账号' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Linux DO 账号管理' })
  const password = dialog.getByLabel('新密码或认证令牌')
  await password.fill('invalid-new-token')
  await dialog.getByRole('button', { name: '验证并更新' }).click()

  await expect(dialog.getByRole('alert')).toContainText('IMAP 登录失败')
  await expect(password).toHaveValue('invalid-new-token')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('disconnects through the destructive confirmation dialog', async ({ page }) => {
  await mockLinuxDoMail(page)
  await page.goto('/linux-do-mail')
  const connectDialog = await openConnectDialog(page)
  await connectDialog.getByLabel('邮箱用户名').fill('member@linux.do')
  await connectDialog.getByLabel('密码或认证令牌').fill('revocable-test-token')
  await connectDialog.getByRole('button', { name: '验证并连接' }).click()
  await page.getByRole('button', { name: '管理 Linux DO 账号' }).click()
  await page.getByRole('dialog', { name: 'Linux DO 账号管理' })
    .getByRole('button', { name: '断开账号' }).click()

  const dialog = page.getByRole('alertdialog', { name: '断开 Linux DO 邮箱？' })
  await expect(dialog).toContainText('已保存的密文会被删除')
  await dialog.getByRole('button', { name: '断开账号' }).click()
  await expect(page.getByRole('heading', { name: '还没有连接 Linux DO 邮箱' })).toBeVisible()
})
