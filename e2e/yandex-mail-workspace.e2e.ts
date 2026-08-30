import { expect, test, type Page, type Route } from '@playwright/test'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockYandexMail(page: Page) {
  let account: Record<string, unknown> | null = null
  let syncingReads = 0
  const connections: unknown[] = []
  const disconnects: string[] = []
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
      qqMailEnabled: false, qqMailWorkspaceEnabled: false,
      yandexMailEnabled: true, yandexMailWorkspaceEnabled: true,
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
    if (path === '/api/yandex-mail/accounts' && request.method() === 'POST') {
      connections.push(request.postDataJSON())
      account = {
        id: 'yandex-mail-1', name: '个人 Yandex 邮箱', email: 'owner@yandex.com',
        status: 'syncing', lastSyncedAt: null, nextSyncAt: 1_787_487_300,
        lastErrorCode: '', lastErrorAt: null, createdAt: 1_787_486_400,
        hasAppPassword: true,
      }
      return json(route, { account }, 201)
    }
    if (path === '/api/yandex-mail/accounts' && request.method() === 'GET') {
      if (account?.status === 'syncing' && ++syncingReads >= 2) {
        account = { ...account, status: 'active', lastSyncedAt: 1_787_486_400 }
      }
      return json(route, { enabled: true, accounts: account ? [account] : [] })
    }
    if (path === '/api/yandex-mail/accounts/yandex-mail-1' && request.method() === 'DELETE') {
      disconnects.push(path)
      account = null
      return json(route, { ok: true, remoteRevocationRequired: true })
    }
    if (path === '/api/yandex-mail/messages') return json(route, {
      messages: account ? [{
        id: 'yandex-message-1', account: {
          id: 'yandex-mail-1', name: '个人 Yandex 邮箱', email: 'owner@yandex.com',
          status: 'active',
        },
        senderName: 'Yandex', senderAddress: 'notice@yandex.com',
        recipients: ['owner@yandex.com'], cc: [], subject: '登录提醒', preview: '',
        date: 1_787_486_400, sizeBytes: 1024, isRead: false, isStarred: false,
        hasAttachments: true,
      }] : [],
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    if (path === '/api/yandex-mail/accounts/yandex-mail-1/messages/yandex-message-1') {
      return json(route, { message: {
        id: 'yandex-message-1', account: {
          id: 'yandex-mail-1', name: '个人 Yandex 邮箱', email: 'owner@yandex.com',
          status: 'active',
        },
        senderName: 'Yandex', senderAddress: 'notice@yandex.com',
        recipients: ['owner@yandex.com'], subject: '登录提醒', preview: '',
        sizeBytes: 1024, isRead: true, isStarred: false, hasAttachments: true,
        from: 'Yandex <notice@yandex.com>', to: 'owner@yandex.com', cc: '',
        date: '2026-08-23T12:00:00.000Z', body: '这是一封 Yandex 测试邮件。', html: '',
        attachments: [{ partId: '0', filename: 'notice.txt', contentType: 'text/plain',
          size: 12, contentId: null, disposition: 'attachment' }],
      } })
    }
    return route.abort()
  })
  return { connections, disconnects }
}

test('connects and manages a read-only Yandex Mail account', async ({ page }) => {
  const state = await mockYandexMail(page)
  await page.goto('/yandex-mail')

  const navigation = page.getByRole('button', { name: 'Yandex 邮箱', exact: true })
  await expect(navigation.locator('svg[data-provider-icon="yandex-mail"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: '连接你的第一个 Yandex 邮箱' })).toBeVisible()
  await page.getByRole('button', { name: '添加 Yandex 邮箱账号' }).click()
  const connect = page.getByRole('dialog', { name: '连接 Yandex 邮箱账号' })
  await expect(connect.getByRole('link', { name: '查看 Yandex 设置指南' }))
    .toHaveAttribute('href', /yandex\.com\/support/)
  await connect.getByLabel('账号名称').fill('个人 Yandex 邮箱')
  await connect.getByLabel('邮箱地址').fill('owner@yandex.com')
  await connect.getByLabel('Yandex 邮箱应用专用密码').fill('yandex-app-password')
  await connect.getByRole('button', { name: '验证并连接' }).click()

  await expect.poll(() => state.connections).toEqual([{
    name: '个人 Yandex 邮箱', email: 'owner@yandex.com', appPassword: 'yandex-app-password',
  }])
  expect(await page.evaluate(() => JSON.stringify(localStorage)))
    .not.toContain('yandex-app-password')
  await expect(page.getByRole('dialog', { name: 'Yandex 邮箱账号管理' })
    .getByText('已连接', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭' }).click()

  const actions = page.locator('.gmail-list-header .icloud-header-action-buttons')
  const actionLabels = await actions.getByRole('button').evaluateAll((buttons) => buttons.map(
    (button) => button.getAttribute('aria-label'),
  ))
  expect(actionLabels).toEqual([
    '复制邮箱地址：owner@yandex.com',
    '管理 Yandex 邮箱账号',
    '同步全部 Yandex 邮箱账号',
  ])

  const unread = page.locator('.gmail-message-list .message-row').filter({ hasText: '登录提醒' })
  await unread.getByRole('button').click()
  await expect(unread).not.toHaveClass(/is-unread/)
  await expect(page.getByText('这是一封 Yandex 测试邮件。')).toBeVisible()
  await expect(page.getByRole('link', { name: /notice\.txt/ })).toHaveAttribute(
    'href', '/api/yandex-mail/accounts/yandex-mail-1/messages/yandex-message-1/attachments/0',
  )
  await expect(page.locator('.gmail-reader-pane').getByRole('button', {
    name: '回复', exact: true,
  })).toHaveCount(0)

  await actions.getByRole('button', { name: '管理 Yandex 邮箱账号' }).click()
  await page.getByRole('dialog', { name: 'Yandex 邮箱账号管理' })
    .getByRole('button', { name: /个人 Yandex 邮箱.*管理/s }).click()
  const settings = page.getByRole('dialog', { name: '设置 个人 Yandex 邮箱' })
  await settings.getByRole('button', { name: '断开账号', exact: true }).click()
  await page.getByRole('alertdialog', { name: '断开 Yandex 邮箱账号？' })
    .getByRole('button', { name: '确认断开' }).click()
  await expect.poll(() => state.disconnects).toEqual([
    '/api/yandex-mail/accounts/yandex-mail-1',
  ])
})
