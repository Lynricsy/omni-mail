import { expect, type Page, type Route, test } from '@playwright/test'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
}

async function shell(route: Route, path: string) {
  if (path === '/api/config') {
    await json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: false,
      iCloudEnabled: false, iCloudWorkspaceEnabled: false,
      linuxDoMailWorkspaceEnabled: false, gmailEnabled: false, gmailWorkspaceEnabled: false,
      microsoftEnabled: true, microsoftWorkspaceEnabled: true,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '', mailRefreshInterval: 0,
      remoteImagesEnabled: false, unassignedMailEnabled: false,
      officialExtensionEnabled: false, randomMailboxPrefix: '', superAdminEmail: '',
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    return true
  }
  if (path === '/api/session') {
    await json(route, { user: {
      id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
      mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
      canCreateMailboxes: false, canReply: false, canTranslate: false,
      temporaryExpiresAt: null,
    } })
    return true
  }
  if (path === '/api/mailboxes') { await json(route, { mailboxes: [] }); return true }
  if (path === '/api/domains') { await json(route, { domains: [] }); return true }
  return false
}

const account = {
  id: 'microsoft-1', name: '工作 Outlook', email: 'user@outlook.com',
  authMode: 'oauth2', clientIdMasked: '0000••••0000', authority: 'common',
  status: 'active', lastSyncedAt: 1_787_486_400, nextSyncAt: 1_787_486_700,
  lastErrorCode: '', lastErrorAt: null, createdAt: 1_787_486_400, hasCredential: true,
}

const message = {
  id: 'message-1', account: {
    id: account.id, name: account.name, email: account.email, status: account.status,
  },
  folderPath: 'INBOX', uidValidity: 42, uid: 7,
  senderName: 'Microsoft', senderAddress: 'security@microsoft.com',
  recipients: ['user@outlook.com'], cc: [], subject: '安全提醒', preview: '',
  date: 1_787_486_400, sentAt: 1_787_486_400, sizeBytes: 2048,
  isRead: false, isStarred: false, hasAttachments: true,
}

test('previews Microsoft OAuth2 formats without echoing secrets', async ({ page }) => {
  await prepare(page)
  const imports: unknown[] = []
  let connected = false
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (await shell(route, path)) return
    if (path === '/api/microsoft/accounts' && request.method() === 'GET') {
      return json(route, { enabled: true, accounts: connected ? [account] : [] })
    }
    if (path === '/api/microsoft/messages') {
      return json(route, { messages: [], page: { hasMore: false, nextCursor: null, limit: 50 }, folderPath: 'INBOX' })
    }
    if (path === '/api/microsoft/accounts/import' && request.method() === 'POST') {
      const body = request.postDataJSON() as { accounts: unknown[] }
      await new Promise((resolve) => setTimeout(resolve, 250))
      imports.push(...body.accounts)
      connected = true
      return json(route, { results: body.accounts.map((_item, index) => ({
        index, status: 'accepted', account,
      })) }, 201)
    }
    return route.abort()
  })

  await page.goto('/microsoft')
  await page.getByRole('button', { name: '添加 Microsoft 账号' }).last().click()
  const dialog = page.getByRole('dialog', { name: '连接 Microsoft 邮箱' })
  await expect(dialog.getByText('仅支持 OAuth2；不再接受仅邮箱密码登录。')).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: '认证方式' })).toHaveCount(0)
  await expect(dialog).toHaveCSS('transform', 'none')
  const fieldsDialogHeight = await dialog.evaluate((element) => element.getBoundingClientRect().height)
  await dialog.getByRole('tab', { name: '批量导入' }).click()
  const initialDialogHeight = await dialog.evaluate((element) => element.getBoundingClientRect().height)
  expect(initialDialogHeight).toBe(fieldsDialogHeight)
  await expect(dialog).toHaveCSS('overflow-y', 'hidden')
  const formats = dialog.locator('#microsoft-import-formats')
  await expect(formats).toContainText('email----password----refresh_token----client_id')
  await expect(formats).toContainText('email----password----client_id----refresh_token')
  expect(await formats.locator('code').allTextContents()).not.toContain('email----password')
  await expect(formats).toContainText('email--------refresh_token----client_id')
  await expect(formats).toContainText('系统按 UUID 自动识别 Client ID')
  await expect(formats).toContainText('password 会加密保存')
  const clientId = '00000000-0000-4000-8000-000000000000'
  const batchInput = dialog.getByLabel('每行一个账号')
  await expect(batchInput).toHaveCSS('resize', 'none')
  const initialInputHeight = await batchInput.evaluate((element) => element.getBoundingClientRect().height)
  const initialNextButtonTop = await dialog.getByRole('button', { name: '下一步：安全预览' })
    .evaluate((element) => element.getBoundingClientRect().top)
  await batchInput.fill([
    `combo@outlook.com----combination-secret----${clientId}----refresh-combo`,
    `reverse@outlook.com----reverse-secret----refresh-reverse----${clientId}`,
    `oauth@outlook.com--------refresh-oauth----${clientId}`,
  ].join('\n'))
  expect(await batchInput.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(initialInputHeight)
  expect(await dialog.getByRole('button', { name: '下一步：安全预览' })
    .evaluate((element) => element.getBoundingClientRect().top)).toBe(initialNextButtonTop)

  await batchInput.evaluate((element) => element.blur())
  await expect(batchInput).not.toHaveClass(/is-scrollbar-visible/)
  await batchInput.dispatchEvent('scroll')
  await expect(batchInput).toHaveClass(/is-scrollbar-visible/)
  await expect(batchInput).not.toHaveClass(/is-scrollbar-visible/, { timeout: 2_000 })
  await batchInput.hover()
  await expect(batchInput).toHaveClass(/is-scrollbar-visible/)
  await page.mouse.move(0, 0)
  await expect(batchInput).not.toHaveClass(/is-scrollbar-visible/)
  await expect(dialog.locator('.microsoft-import-preview')).toHaveCount(0)
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  await expect(dialog.getByLabel('每行一个账号')).toHaveCSS('scrollbar-width', 'thin')
  await dialog.getByRole('button', { name: '下一步：安全预览' }).click()
  await expect.poll(() => dialog.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(initialDialogHeight)
  const preview = dialog.locator('.microsoft-import-preview')
  await expect(preview).toContainText('OAuth2 · 组合密码将加密保存')
  await expect(preview).toContainText('0000••••0000')
  await expect(preview).not.toContainText('combination-secret')
  await expect(preview).not.toContainText('reverse-secret')
  await expect(preview).not.toContainText('refresh-combo')

  const consent = dialog.getByRole('checkbox')
  await expect(consent).toHaveCSS('appearance', 'none')
  await expect(consent).toHaveCSS('width', '18px')
  await dialog.getByRole('button', { name: '开始导入 3 个账号' }).click()
  await expect(dialog.getByText('请先确认允许加密保存 OAuth2 组合密码。')).toBeVisible()
  expect(await dialog.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true)
  await consent.check()
  await expect(consent).toBeChecked()
  await expect(consent).toHaveCSS('background-color', 'rgb(29, 29, 31)')
  await dialog.getByRole('button', { name: '开始导入 3 个账号' }).click()
  await expect.poll(() => dialog.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(initialDialogHeight)
  const progress = dialog.locator('.microsoft-import-progress')
  await expect(progress).toBeVisible()
  await expect(progress).toContainText('正在逐项验证 Microsoft 账号')
  await expect(progress.getByRole('progressbar')).toBeVisible()
  await expect(preview.locator('.microsoft-import-item-status.is-running')).toHaveCount(1)
  await expect(preview.locator('.microsoft-import-item-status.is-success')).toHaveCount(1)
  const runningPreviewHeight = await preview.evaluate((element) => element.getBoundingClientRect().height)
  const runningButtonTop = await dialog.getByRole('button', { name: '正在逐项导入' })
    .evaluate((element) => element.getBoundingClientRect().top)
  await expect(preview.locator('li')).toHaveCount(2)
  await expect.poll(() => preview.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(runningPreviewHeight)
  await expect.poll(() => dialog.getByRole('button', { name: '正在逐项导入' })
    .evaluate((element) => element.getBoundingClientRect().top)).toBe(runningButtonTop)
  await expect.poll(() => imports).toHaveLength(3)
  await expect(progress).toHaveCount(0)
  await expect(dialog.getByText('导入完成', { exact: true })).toBeVisible()
  await expect(dialog.getByText('成功 3 个，失败 0 个。')).toBeVisible()
  await expect.poll(() => dialog.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(initialDialogHeight)
  await expect(preview.locator('li')).toHaveCount(0)
  expect(imports).toEqual([
    expect.objectContaining({ email: 'combo@outlook.com', authMode: 'oauth2',
      refreshToken: 'refresh-combo', clientId, password: 'combination-secret',
      persistPasswordConfirmed: true }),
    expect.objectContaining({ email: 'reverse@outlook.com', authMode: 'oauth2',
      refreshToken: 'refresh-reverse', clientId, password: 'reverse-secret',
      persistPasswordConfirmed: true }),
    expect.objectContaining({ email: 'oauth@outlook.com', authMode: 'oauth2' }),
  ])
  expect(Object.prototype.hasOwnProperty.call(imports[2], 'password')).toBe(false)
  const backdrop = page.locator('.microsoft-dialog-backdrop')
  await dialog.getByRole('button', { name: '关闭' }).click()
  await expect(backdrop).toHaveClass(/is-closing/)
  await expect(backdrop).toHaveCount(0)
})

test('bulk-manages and disconnects selected Microsoft accounts', async ({ page }) => {
  await prepare(page)
  const managedAccounts = [account,
    { ...account, id: 'microsoft-2', name: 'Personal Outlook', email: 'personal@outlook.com' },
    { ...account, id: 'microsoft-3', name: 'Archive Outlook', email: 'archive@outlook.com' },
  ]
  let activeAccounts = [...managedAccounts]
  const disconnects: string[] = []
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (await shell(route, path)) return
    if (path === '/api/microsoft/accounts' && request.method() === 'GET') {
      return json(route, { enabled: true, accounts: activeAccounts })
    }
    if (path === '/api/microsoft/messages') {
      return json(route, { messages: [], page: { hasMore: false, nextCursor: null, limit: 50 }, folderPath: 'INBOX' })
    }
    const disconnectMatch = path.match(/^\/api\/microsoft\/accounts\/([^/]+)$/)
    if (disconnectMatch && request.method() === 'DELETE') {
      const id = decodeURIComponent(disconnectMatch[1])
      disconnects.push(id)
      activeAccounts = activeAccounts.filter((candidate) => candidate.id !== id)
      return json(route, { ok: true, remoteRevocationRequired: true })
    }
    return route.abort()
  })

  await page.goto('/microsoft')
  await page.getByRole('button', { name: '管理 Microsoft 账号' }).click()
  let dialog = page.getByRole('dialog', { name: 'Microsoft 账号管理' })
  await expect(dialog.getByText('已连接 3 个账号')).toBeVisible()
  await expect(dialog).toHaveCSS('transform', 'none')
  await dialog.locator('.gmail-account-card').first().click()
  const accountSettings = page.getByRole('dialog', { name: '设置 工作 Outlook' })
  await accountSettings.getByRole('button', { name: '断开账号' }).click()
  const disconnectConfirm = page.getByRole('alertdialog', { name: '确认断开并删除本地加密凭据？' })
  await expect(disconnectConfirm).toBeVisible()
  await expect(accountSettings.locator('.gmail-delete-confirm')).toHaveCount(0)
  await disconnectConfirm.getByRole('button', { name: '取消' }).click()
  await expect(disconnectConfirm).toHaveCount(0)
  await accountSettings.getByRole('button', { name: '返回' }).click()
  dialog = page.getByRole('dialog', { name: 'Microsoft 账号管理' })
  const managementDialogHeight = await dialog.evaluate((element) => element.getBoundingClientRect().height)
  await dialog.getByRole('button', { name: '添加账号' }).click()
  const connectDialog = page.getByRole('dialog', { name: '连接 Microsoft 邮箱' })
  await expect(connectDialog).toBeVisible()
  expect(await connectDialog.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(managementDialogHeight)
  await connectDialog.getByRole('button', { name: '返回' }).click()
  dialog = page.getByRole('dialog', { name: 'Microsoft 账号管理' })
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(managementDialogHeight)
  await dialog.getByRole('button', { name: '批量管理' }).click()
  const selectAll = dialog.getByRole('checkbox', { name: '全选 Microsoft 账号' })
  const first = dialog.getByRole('checkbox', { name: '选择 Microsoft 账号：user@outlook.com' })
  const second = dialog.getByRole('checkbox', { name: '选择 Microsoft 账号：personal@outlook.com' })
  await first.check()
  await expect(dialog.getByText('已选择 1 个账号')).toBeVisible()
  await expect(selectAll).toHaveJSProperty('indeterminate', true)
  await second.check()
  await expect(dialog.getByRole('button', { name: '批量断开 2 个账号' })).toBeEnabled()
  await dialog.getByRole('button', { name: '批量断开 2 个账号' }).click()
  const confirm = page.getByRole('alertdialog', { name: '确认批量断开 2 个账号？' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '确认批量断开' }).click()
  await expect.poll(() => disconnects).toEqual(['microsoft-1', 'microsoft-2'])
  await expect(dialog.getByText('已连接 1 个账号')).toBeVisible()
  await expect(dialog.getByText('已批量断开 2 个 Microsoft 账号；请同时撤销应用授权。')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '批量管理' })).toBeVisible()
})

test('keeps Microsoft account actions fixed while the account cards scroll', async ({ page }) => {
  await prepare(page)
  const accounts = Array.from({ length: 12 }, (_value, index) => ({
    ...account,
    id: `microsoft-${index + 1}`,
    name: `Outlook ${index + 1}`,
    email: `user${index + 1}@outlook.com`,
  }))
  await page.route('**://*/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (await shell(route, path)) return
    if (path === '/api/microsoft/accounts') return json(route, { enabled: true, accounts })
    if (path === '/api/microsoft/messages') {
      return json(route, { messages: [], page: { hasMore: false, nextCursor: null, limit: 50 }, folderPath: 'INBOX' })
    }
    return route.abort()
  })

  await page.goto('/microsoft')
  await page.getByRole('button', { name: '管理 Microsoft 账号' }).click()
  const dialog = page.getByRole('dialog', { name: 'Microsoft 账号管理' })
  await expect(dialog).toHaveCSS('transform', 'none')
  const body = dialog.locator('.microsoft-dialog-body')
  const summary = dialog.locator('.gmail-account-list__summary')
  const cards = dialog.locator('.microsoft-account-card-list')
  const addAccount = dialog.getByRole('button', { name: '添加账号' })
  const firstCard = cards.locator('.gmail-account-card').first()

  await expect(body).toHaveCSS('overflow-y', 'hidden')
  await expect(cards).toHaveCSS('overflow-y', 'auto')
  expect(await body.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true)
  expect(await cards.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  const summaryTop = await summary.evaluate((element) => element.getBoundingClientRect().top)
  const actionTop = await addAccount.evaluate((element) => element.getBoundingClientRect().top)
  await cards.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => cards.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await summary.evaluate((element) => element.getBoundingClientRect().top)).toBe(summaryTop)
  expect(await addAccount.evaluate((element) => element.getBoundingClientRect().top)).toBe(actionTop)
  expect(await firstCard.evaluate((element) => element.getBoundingClientRect().bottom))
    .toBeLessThan(await cards.evaluate((element) => element.getBoundingClientRect().top))
})

test('browses Microsoft mail, reflects Seen updates, and renders on mobile', async ({ page }) => {
  await prepare(page)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 375, height: 812 })
  await page.addInitScript(() => localStorage.setItem('omnimail-theme', 'dark'))
  const listQueries: string[] = []
  const syncedAccounts: string[] = []
  const secondAccount = { ...account, id: 'microsoft-2', name: 'Personal Outlook',
    email: 'personal@outlook.com' }
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (await shell(route, path)) return
    if (path === '/api/microsoft/accounts') {
      return json(route, { enabled: true, accounts: [account, secondAccount] })
    }
    const syncMatch = path.match(/^\/api\/microsoft\/accounts\/([^/]+)\/sync$/)
    if (syncMatch && request.method() === 'POST') {
      syncedAccounts.push(decodeURIComponent(syncMatch[1]))
      return json(route, { queued: true }, 202)
    }
    if (path === '/api/microsoft/accounts/microsoft-1/folders') return json(route, { folders: [
      { path: 'INBOX', displayName: 'Inbox', flags: ['\\Inbox'], specialUse: '\\Inbox', uidValidity: 42, lastUid: 7 },
      { path: 'Sent Items', displayName: 'Sent Items', flags: ['\\Sent'], specialUse: '\\Sent', uidValidity: 43, lastUid: 2 },
    ] })
    if (path === '/api/microsoft/messages') {
      listQueries.push(url.search)
      return json(route, {
        messages: [message], page: { hasMore: false, nextCursor: null,
          limit: Number(url.searchParams.get('limit') || 50) }, folderPath: 'INBOX',
      })
    }
    if (path === '/api/microsoft/accounts/microsoft-1/messages/message-1') {
      return json(route, { message: {
        ...message, isRead: true, from: 'Microsoft <security@microsoft.com>', to: 'user@outlook.com',
        cc: '', date: '2026-08-25T00:00:00.000Z', body: '只读测试正文', html: '',
        attachments: [{ partId: '0', filename: 'notice.txt', contentType: 'text/plain',
          size: 12, contentId: null, disposition: 'attachment' }],
      } })
    }
    return route.abort()
  })

  await page.goto('/microsoft')
  const headerCopy = page.getByRole('button', { name: '复制当前邮箱 user@outlook.com' })
  await expect(headerCopy).toBeEnabled()
  await headerCopy.click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('user@outlook.com')
  const syncAll = page.getByRole('button', { name: '同步全部 Microsoft 账号' })
  await expect(syncAll).toBeEnabled()
  await syncAll.click()
  await expect.poll(() => syncedAccounts).toEqual(['microsoft-1', 'microsoft-2'])
  await expect(page.getByText('已将 2 个 Microsoft 账号加入同步队列。')).toBeVisible()
  const scopeTrigger = page.getByRole('button', { name: /当前 Microsoft/ })
  await expect(scopeTrigger).toContainText('全部 Microsoft')
  await scopeTrigger.click()
  let scope = page.getByRole('dialog', { name: '选择 Microsoft 邮箱' })
  const copyAddress = scope.getByRole('button', { name: '复制邮箱地址：user@outlook.com' })
  await copyAddress.click()
  await expect(scope).toBeVisible()
  await expect(scope.getByRole('button', { name: '已复制：user@outlook.com' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('user@outlook.com')
  await scope.getByRole('button', { name: /工作 Outlook/ }).click()
  await expect(scopeTrigger).toContainText('工作 Outlook')
  await scopeTrigger.click()
  scope = page.getByRole('dialog', { name: '选择 Microsoft 邮箱' })
  await expect(scope.getByText('INBOX 约每 5 分钟定时收信；其他文件夹可手动刷新。')).toBeVisible()
  await scope.getByRole('button', { name: '200' }).click()
  await expect.poll(() => listQueries.some((query) => query.includes('limit=200'))).toBe(true)
  await expect(page.getByRole('button', { name: '远程刷新当前文件夹' })).toBeEnabled()
  await page.getByRole('button', { name: '远程刷新当前文件夹' }).click()
  await expect.poll(() => listQueries.some((query) => query.includes('refresh=1'))).toBe(true)
  await page.getByText('安全提醒').click()
  await expect(page.getByText('只读测试正文')).toBeVisible()
  await expect(page.locator('.microsoft-reader .gmail-readonly-note')).toHaveCount(0)
  await expect(page.locator('.message-row.is-unread')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /notice.txt/ })).toHaveAttribute(
    'href', '/api/microsoft/accounts/microsoft-1/messages/message-1/attachments/0',
  )

  const workspace = page.locator('.microsoft-workspace')
  await expect(workspace).toBeVisible()
  await expect(page.locator('.microsoft-list-controls')).toHaveCount(0)
  expect(await workspace.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)

  await page.getByRole('button', { name: '返回邮件列表' }).click()
  await page.getByRole('button', { name: '管理 Microsoft 账号' }).click()
  const mobileDialog = page.getByRole('dialog', { name: 'Microsoft 账号管理' })
  await expect(mobileDialog).toHaveCSS('transform', 'none')
  expect(await mobileDialog.evaluate((element) => ({
    fitsViewport: element.getBoundingClientRect().height <= window.innerHeight,
    noHorizontalOverflow: element.scrollWidth <= element.clientWidth,
  }))).toEqual({ fitsViewport: true, noHorizontalOverflow: true })
  await expect(mobileDialog).toHaveCSS('overflow-y', 'hidden')
  await expect(mobileDialog.locator('.microsoft-dialog-body')).toHaveCSS('overflow-y', 'hidden')
  await expect(mobileDialog.locator('.microsoft-account-card-list')).toHaveCSS('overflow-y', 'auto')
})
