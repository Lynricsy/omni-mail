import { expect, test, type Page, type Route } from '@playwright/test'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockQqMail(page: Page) {
  let account: Record<string, unknown> | null = null
  const connections: unknown[] = []
  const sentMessages: unknown[] = []
  const disconnects: string[] = []
  const identityAdds: unknown[] = []
  const identityDeletes: string[] = []
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: false,
      iCloudEnabled: false, iCloudWorkspaceEnabled: false,
      linuxDoMailWorkspaceEnabled: false, gmailEnabled: false, gmailWorkspaceEnabled: false,
      microsoftEnabled: false, microsoftWorkspaceEnabled: false,
      qqMailEnabled: true, qqMailWorkspaceEnabled: true,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '', mailRefreshInterval: 0,
      remoteImagesEnabled: false, unassignedMailEnabled: false,
      officialExtensionEnabled: false, randomMailboxPrefix: '', superAdminEmail: '',
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
    if (path === '/api/qq-mail/accounts' && request.method() === 'POST') {
      connections.push(request.postDataJSON())
      account = {
        id: 'qq-mail-1', name: '个人 QQ 邮箱', email: '123456789@qq.com', status: 'active',
        lastSyncedAt: 1_787_486_400, nextSyncAt: 1_787_486_700,
        lastErrorCode: '', lastErrorAt: null, createdAt: 1_787_486_400,
        hasAuthorizationCode: true,
        identities: [{ id: 'qq-mail-1', accountId: 'qq-mail-1', name: '个人 QQ 邮箱',
          email: '123456789@qq.com', isPrimary: true,
          createdAt: 1_787_486_400, updatedAt: 1_787_486_400 }],
      }
      return json(route, { account }, 201)
    }
    if (path === '/api/qq-mail/accounts' && request.method() === 'GET') {
      return json(route, { enabled: true, accounts: account ? [account] : [] })
    }
    if (path === '/api/qq-mail/accounts/qq-mail-1' && request.method() === 'DELETE') {
      disconnects.push(path)
      account = null
      return json(route, { ok: true, remoteRevocationRequired: true })
    }
    if (path === '/api/qq-mail/accounts/qq-mail-1/identities'
      && request.method() === 'POST' && account) {
      identityAdds.push(request.postDataJSON())
      const identity = { id: 'identity-foxmail', accountId: 'qq-mail-1', name: 'Foxmail 邮箱',
        email: 'mimanchi4412@foxmail.com', isPrimary: false,
        createdAt: 1_787_486_500, updatedAt: 1_787_486_500 }
      account = { ...account, identities: [...account.identities as unknown[], identity] }
      return json(route, { account }, 201)
    }
    if (path === '/api/qq-mail/accounts/qq-mail-1/identities/identity-foxmail'
      && request.method() === 'DELETE' && account) {
      identityDeletes.push(path)
      account = { ...account, identities: (account.identities as Array<{ id: string }>)
        .filter(({ id }) => id !== 'identity-foxmail') }
      return json(route, { account })
    }
    if (path === '/api/qq-mail/accounts/qq-mail-1/messages' && request.method() === 'POST') {
      sentMessages.push(request.postDataJSON())
      return json(route, { message: { id: 'sent-1', status: 'processing' } }, 202)
    }
    if (path === '/api/qq-mail/messages') {
      return json(route, {
        messages: account ? [{
          id: 'qq-message-1', account: {
            id: 'qq-mail-1', name: '个人 QQ 邮箱', email: '123456789@qq.com', status: 'active',
          },
          senderName: 'QQ 安全中心', senderAddress: 'security@qq.com',
          recipients: ['123456789@qq.com'], cc: [], subject: '登录提醒', preview: '',
          date: 1_787_486_400, sizeBytes: 1024, isRead: false, isStarred: false,
          hasAttachments: true,
        }] : [],
        page: { hasMore: false, nextCursor: null, limit: 30 },
      })
    }
    if (path === '/api/qq-mail/accounts/qq-mail-1/messages/qq-message-1') {
      return json(route, { message: {
        id: 'qq-message-1', account: {
          id: 'qq-mail-1', name: '个人 QQ 邮箱', email: '123456789@qq.com', status: 'active',
        },
        senderName: 'QQ 安全中心', senderAddress: 'security@qq.com',
        recipients: ['123456789@qq.com'], subject: '登录提醒', preview: '',
        sizeBytes: 1024, isRead: true, isStarred: false, hasAttachments: true,
        from: 'QQ 安全中心 <security@qq.com>', to: '123456789@qq.com', cc: '',
        date: '2026-08-23T12:00:00.000Z', body: '这是一封 QQ 邮箱测试邮件。', html: '',
        attachments: [{ partId: '0', filename: 'notice.txt', contentType: 'text/plain',
          size: 12, contentId: null, disposition: 'attachment' }],
      } })
    }
    return route.abort()
  })
  return { connections, sentMessages, disconnects, identityAdds, identityDeletes }
}

test('connects a QQ Mail account and opens an indexed message', async ({ page }) => {
  const state = await mockQqMail(page)
  await page.goto('/qq-mail')

  const qqNavigation = page.getByRole('button', { name: 'QQ 邮箱', exact: true })
  await expect(qqNavigation.locator('svg[data-provider-icon="qq-mail"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gmail 邮箱', exact: true })
    .locator('svg[data-provider-icon="qq-mail"]')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '连接你的第一个 QQ 邮箱' })).toBeVisible()
  await page.locator('.gmail-list-state--empty')
    .getByRole('button', { name: '添加 QQ 邮箱账号' }).click()
  const connect = page.getByRole('dialog', { name: '连接 QQ 邮箱账号' })
  await expect(connect.getByRole('link', { name: '打开 QQ 邮箱设置' }))
    .toHaveAttribute('href', 'https://mail.qq.com/')
  await connect.getByLabel('账号名称').fill('个人 QQ 邮箱')
  await connect.getByLabel('邮箱地址').fill('123456789@qq.com')
  await connect.getByLabel('QQ 邮箱授权码').fill('qq-authorization-code')
  await connect.getByRole('button', { name: '验证并连接' }).click()

  await expect.poll(() => state.connections).toEqual([{
    name: '个人 QQ 邮箱', email: '123456789@qq.com',
    authorizationCode: 'qq-authorization-code',
  }])
  await expect(page.getByRole('dialog', { name: 'QQ 邮箱账号管理' }))
    .toContainText('已连接 1 个账号')
  expect(await page.evaluate(() => JSON.stringify(localStorage)))
    .not.toContain('qq-authorization-code')
  await page.getByRole('dialog', { name: 'QQ 邮箱账号管理' })
    .getByRole('button', { name: /个人 QQ 邮箱.*管理/s }).click()
  const settingsMenu = page.getByRole('dialog', { name: '设置 个人 QQ 邮箱' })
  await expect(settingsMenu.locator('.qq-mail-settings-option')).toHaveCount(6)
  await expect(settingsMenu.locator('form')).toHaveCount(0)
  const settingsHeight = (await settingsMenu.boundingBox())!.height
  await settingsMenu.getByRole('button', { name: /邮箱身份/ }).click()
  const identityPanel = page.getByRole('dialog', { name: '邮箱身份' })
  await expect(identityPanel).toBeVisible()
  await expect(identityPanel.locator('.qq-mail-dialog-pane')).toHaveClass(/is-forward/)
  await expect(identityPanel.locator('.qq-mail-dialog-pane'))
    .toHaveCSS('animation-name', 'qq-mail-view-enter')
  expect(Math.abs((await identityPanel.boundingBox())!.height - settingsHeight)).toBeLessThan(1)
  const identitySettings = page.getByRole('region', { name: '邮箱身份' })
  await identitySettings.getByLabel('身份名称').fill('Foxmail 邮箱')
  await identitySettings.getByLabel('邮箱地址').fill('mimanchi4412@foxmail.com')
  await identitySettings.getByRole('button', { name: '验证并添加身份' }).click()
  await expect.poll(() => state.identityAdds).toEqual([{
    name: 'Foxmail 邮箱', email: 'mimanchi4412@foxmail.com',
  }])
  await expect(identitySettings.getByText('mimanchi4412@foxmail.com')).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()

  const actions = page.locator('.gmail-list-header .icloud-header-action-buttons')
  await expect(actions.getByRole('button', { name: '添加 QQ 邮箱账号' })).toHaveCount(0)
  await expect(actions.getByRole('button')).toHaveCount(4)
  const actionLabels = await actions.getByRole('button').evaluateAll((buttons) => buttons.map((button) => (
    button.getAttribute('aria-label')
  )))
  expect(actionLabels).toEqual([
    '新建 QQ 邮件',
    '复制邮箱地址：123456789@qq.com',
    '管理 QQ 邮箱账号',
    '同步全部 QQ 邮箱账号',
  ])
  expect(await actions.getByRole('button').evaluateAll((buttons) => buttons.map((button) => (
    button.getAttribute('data-tooltip')
  )))).toEqual(actionLabels)

  const unreadRow = page.locator('.gmail-message-list .message-row').filter({ hasText: '登录提醒' })
  await expect(unreadRow).toHaveClass(/is-unread/)
  await unreadRow.getByRole('button').click()
  await expect(unreadRow).not.toHaveClass(/is-unread/)
  await expect(page.getByRole('heading', { name: '登录提醒' })).toBeVisible()
  await expect(page.getByText('这是一封 QQ 邮箱测试邮件。')).toBeVisible()
  await expect(page.getByRole('link', { name: /notice\.txt/ })).toHaveAttribute(
    'href', '/api/qq-mail/accounts/qq-mail-1/messages/qq-message-1/attachments/0',
  )
  const reader = page.locator('.gmail-reader-pane')
  await expect(reader.locator('.reader-toolbar')
    .getByRole('button', { name: '回复', exact: true })).toHaveCount(0)
  const replyButton = reader.locator('.reader-content')
    .getByRole('button', { name: '回复', exact: true })
  await expect(reader.locator('.icloud-reader-inner > :last-child'))
    .toHaveClass(/icloud-reader-actions/)
  await expect(replyButton).toBeVisible()
  await replyButton.click()
  const reply = page.getByRole('dialog', { name: '回复 QQ 邮件' })
  await reply.getByRole('combobox', { name: '发件人' }).click()
  await reply.getByRole('option', { name: /Foxmail 邮箱.*mimanchi4412@foxmail\.com/s }).click()
  await expect(reply.getByLabel('收件人')).toHaveValue('security@qq.com')
  await expect(reply.getByLabel('主题')).toHaveValue('Re: 登录提醒')
  await reply.getByLabel('正文').fill('收到，谢谢。')
  await reply.getByRole('button', { name: '发送邮件' }).click()
  await expect.poll(() => state.sentMessages).toEqual([expect.objectContaining({
    sender: 'mimanchi4412@foxmail.com',
    to: 'security@qq.com', subject: 'Re: 登录提醒', text: '收到，谢谢。',
    replyToMessageId: 'qq-message-1',
  })])
  await expect(page.getByRole('status')).toContainText('QQ 邮件已加入发送队列')

  await actions.getByRole('button', { name: '管理 QQ 邮箱账号' }).click()
  await page.getByRole('dialog', { name: 'QQ 邮箱账号管理' })
    .getByRole('button', { name: /个人 QQ 邮箱.*管理/s }).click()
  const accountSettings = page.getByRole('dialog', { name: '设置 个人 QQ 邮箱' })
  await accountSettings.getByRole('button', { name: /邮箱身份/ }).click()
  const identityDialog = page.getByRole('dialog', { name: '邮箱身份' })
  await identityDialog.getByRole('button', {
    name: '删除发信身份：mimanchi4412@foxmail.com',
  }).click()
  await page.getByRole('alertdialog', { name: '删除发信身份？' })
    .getByRole('button', { name: '确认删除' }).click()
  await expect.poll(() => state.identityDeletes).toEqual([
    '/api/qq-mail/accounts/qq-mail-1/identities/identity-foxmail',
  ])
  await expect(identityDialog.getByText('mimanchi4412@foxmail.com')).toHaveCount(0)
  await identityDialog.getByRole('button', { name: '返回' }).click()
  await expect(accountSettings.locator('.qq-mail-dialog-pane')).toHaveClass(/is-back/)
  expect(Math.abs((await accountSettings.boundingBox())!.height - settingsHeight)).toBeLessThan(1)
  const disconnect = accountSettings.getByRole('button', { name: /断开这个 QQ 邮箱账号/ })
  await disconnect.click()
  const confirmation = page.getByRole('alertdialog', { name: '断开 QQ 邮箱账号？' })
  await expect(confirmation).toBeVisible()
  await expect(page.locator('.gmail-delete-confirm')).toHaveCount(0)
  await confirmation.getByRole('button', { name: '取消' }).click()
  await expect(confirmation).toHaveCount(0)
  await expect(disconnect).toBeFocused()

  await disconnect.click()
  await page.getByRole('alertdialog', { name: '断开 QQ 邮箱账号？' })
    .getByRole('button', { name: '确认断开' }).click()
  await expect.poll(() => state.disconnects).toEqual(['/api/qq-mail/accounts/qq-mail-1'])
  await expect(page.getByRole('dialog', { name: 'QQ 邮箱账号管理' }))
    .toContainText('已连接 0 个账号')
})
