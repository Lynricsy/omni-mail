import { expect, type Page, type Route, test } from '@playwright/test'

function json(route: Route, body: unknown) {
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockICloud(page: Page, options: {
  failCreateAt?: number
  hasAppPassword?: boolean
  rejectAccountCreate?: boolean
} = {}) {
  const hasAppPassword = options.hasAppPassword ?? true
  const aliases = [{
    email: 'shop@icloud.com', anonymousId: 'alias-1', label: 'Shopping', active: true,
  }]
  const inboxAliases: string[] = []
  const inboxQueries: string[] = []
  const messageReads: string[] = []
  const createdLabels: string[] = []
  const createdEmails: string[] = []
  const createdPreviewIds: string[] = []
  const previewedEmails: string[] = []
  const accountNames: string[] = []
  const accountCreates: Array<{
    name: string
    host: string
    cookies: string
    icloudEmail?: string
    appPassword?: string
  }> = []
  const cookieUpdates: string[] = []
  const passwordUpdates: Array<{ icloudEmail: string; appPassword: string }> = []
  const deletedAccountIds: string[] = []
  let accountDeleted = false
  let createAttempts = 0
  let accountName = 'Personal'
  const previewCandidates = [
    'preview-one@icloud.com', 'github-1@icloud.com', 'github-2@icloud.com',
    'github-3@icloud.com', 'github-4@icloud.com', 'github-5@icloud.com',
  ]
  const previewIds = previewCandidates.map((_, index) => (
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
  ))
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    })
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: false,
      iCloudEnabled: true, iCloudWorkspaceEnabled: true, linuxDoMailWorkspaceEnabled: true,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '', mailRefreshInterval: 0,
      remoteImagesEnabled: true, unassignedMailEnabled: false, superAdminEmail: '',
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (path === '/api/session') return json(route, { user: {
      id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
      mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
      canCreateMailboxes: false, canReply: false, canTranslate: false,
      temporaryExpiresAt: null,
    } })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/remote-images') return route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><rect width="120" height="32" rx="6" fill="#24292f"/><text x="60" y="21" text-anchor="middle" fill="white">GitHub</text></svg>',
    })
    const account = {
      id: 'icloud-1', name: accountName, realEmail: 'owner@example.com',
      icloudEmail: 'owner@icloud.com', host: 'icloud.com', status: 'active',
      aliasTotal: 1, aliasActive: 1, lastValidated: '2026-08-13T00:00:00.000Z',
      lastError: '', createdAt: '2026-08-13T00:00:00.000Z',
      hasCookies: true, hasAppPassword,
    }
    if (path === '/api/icloud/accounts' && request.method() === 'POST') {
      accountCreates.push(request.postDataJSON())
      if (options.rejectAccountCreate) return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'iCloud Cookie 已失效，或账号未开通 iCloud+、没有 Hide My Email 权限。',
        }),
      })
      return json(route, { account })
    }
    if (path === '/api/icloud/accounts') return json(route, { accounts: accountDeleted ? [] : [account] })
    if (path === '/api/icloud/accounts/icloud-1' && request.method() === 'DELETE') {
      accountDeleted = true
      deletedAccountIds.push('icloud-1')
      return json(route, { ok: true })
    }
    if (path === '/api/icloud/accounts/icloud-1' && request.method() === 'PATCH') {
      const input = request.postDataJSON() as { name: string }
      accountName = input.name
      accountNames.push(input.name)
      return json(route, { ok: true, name: input.name })
    }
    if (path === '/api/icloud/accounts/icloud-1/cookies' && request.method() === 'PUT') {
      const input = request.postDataJSON() as { cookies: string }
      cookieUpdates.push(input.cookies)
      return json(route, { account })
    }
    if (path === '/api/icloud/accounts/icloud-1/app-password' && request.method() === 'PUT') {
      const input = request.postDataJSON() as { icloudEmail: string; appPassword: string }
      passwordUpdates.push(input)
      return json(route, { ok: true, icloudEmail: input.icloudEmail })
    }
    if (path === '/api/icloud/aliases/preview' && request.method() === 'POST') {
      const index = Math.min(previewedEmails.length, previewCandidates.length - 1)
      const email = previewCandidates[index]
      previewedEmails.push(email)
      return json(route, { email, previewId: previewIds[index] })
    }
    if (path === '/api/icloud/aliases' && request.method() === 'POST') {
      createAttempts += 1
      if (createAttempts === options.failCreateAt) return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'iCloud 暂时无法创建这个地址。' }),
      })
      const input = request.postDataJSON() as { email: string; label: string; previewId: string }
      createdLabels.push(input.label)
      createdEmails.push(input.email)
      createdPreviewIds.push(input.previewId)
      const alias = {
        email: input.email, anonymousId: `alias-${aliases.length + 1}`,
        label: input.label || 'OmniMail 2026-08-18 10:00', active: true,
      }
      aliases.push(alias)
      return json(route, { alias })
    }
    if (path === '/api/icloud/aliases') return json(route, { aliases })
    if (path === '/api/icloud/inbox') {
      const alias = url.searchParams.get('alias') || ''
      const query = url.searchParams.get('q') || ''
      inboxAliases.push(alias)
      inboxQueries.push(query)
      const messages = query === 'missing' ? [] : [{
      id: '42', from: 'GitHub <noreply_at_github_com_22h56q5td86002_47bfb5aa@icloud.com>', to: alias || 'shop@icloud.com',
      subject: 'Your receipt', date: '2026-08-13T00:00:00.000Z',
      preview: 'Thanks for your order.', body: 'Thanks for your order.', html: '',
      }]
      return json(route, { method: hasAppPassword ? 'imap' : 'web', messages })
    }
    if (path === '/api/icloud/inbox/42') {
      messageReads.push('42')
      return json(route, { message: {
      id: '42', from: 'GitHub <noreply_at_github_com_22h56q5td86002_47bfb5aa@icloud.com>', to: 'shop@icloud.com',
      subject: 'Your receipt', date: '2026-08-13T00:00:00.000Z',
      preview: 'Thanks for your order.', body: 'Full receipt body.',
      html: `<html><body><img src="https://github.com/logo.png" alt="GitHub"><h1>Full receipt body.</h1><p><a href="https://github.com/account_verifications">Open receipt</a></p>${'<p>Receipt details</p>'.repeat(80)}<script>document.body.textContent="unsafe"</script></body></html>`,
      } })
    }
    return route.abort()
  })
  return {
    accountCreates, accountNames, cookieUpdates, createdEmails, createdLabels, createdPreviewIds,
    deletedAccountIds,
    inboxAliases, inboxQueries, messageReads, passwordUpdates, previewedEmails,
  }
}

test('iCloud workspace is available to a regular user and reads a message', async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1150 })
  const state = await mockICloud(page)
  await page.goto('/icloud')

  await expect(page.getByRole('button', { name: '回到列表顶部：iCloud' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'iCloud', exact: true })).toBeVisible()
  await expect(page.getByText('Personal')).toBeVisible()
  await expect(page.getByText('Your receipt')).toBeVisible()
  await expect(page.getByText('IMAP 完整邮件')).toBeVisible()
  const mailSearch = page.getByRole('searchbox', { name: '搜索邮件' })
  await mailSearch.fill('receipt')
  await expect.poll(() => state.inboxQueries.at(-1)).toBe('receipt')
  await expect(page.getByText('Your receipt')).toBeVisible()
  await mailSearch.fill('missing')
  await expect(page.getByRole('heading', { name: '没有匹配的 iCloud 邮件' })).toBeVisible()
  await mailSearch.fill('')
  await expect(page.getByText('Your receipt')).toBeVisible()
  const addAccount = page.getByRole('button', { name: '添加 iCloud 账号' })
  await addAccount.hover()
  await expect(page.getByRole('tooltip')).toHaveText('添加 iCloud 账号')

  await addAccount.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.icloud-modal-backdrop')).toHaveClass(/is-visible/)
  await expect(page.getByRole('dialog').getByRole('textbox', { name: '账号名称' }))
    .toBeFocused()
  const region = page.getByRole('dialog').getByRole('group', { name: 'iCloud 区域' })
  const globalRegion = region.getByRole('button', { name: /全球/ })
  const chinaRegion = region.getByRole('button', { name: /中国大陆/ })
  const indicator = region.locator('.icloud-region-select__indicator')
  const initialX = (await indicator.boundingBox())?.x || 0
  await expect(globalRegion).toHaveAttribute('aria-pressed', 'true')
  await expect(indicator).toHaveCSS('transition-property', 'transform')
  await chinaRegion.click()
  await expect(chinaRegion).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await indicator.boundingBox())?.x || 0).toBeGreaterThan(initialX)
  await globalRegion.focus()
  await globalRegion.press('Enter')
  await expect(globalRegion).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(page.locator('.icloud-modal-backdrop')).not.toHaveClass(/is-visible/)
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.getByRole('button', { name: /当前 iCloud.*Personal/ }).click()
  let scopeDialog = page.getByRole('dialog', { name: '选择查看范围' })
  await expect(scopeDialog).toBeVisible()
  const accountSettings = scopeDialog.getByRole('button', { name: '设置 iCloud 账号：Personal' })
  await expect(accountSettings).toHaveCSS('width', '44px')
  await expect(accountSettings).toHaveCSS('height', '44px')
  await accountSettings.click()
  await expect(scopeDialog).toBeHidden()

  const settingsDialog = page.locator('.icloud-modal')
  await expect(settingsDialog).toHaveAccessibleName('设置 Personal')
  const nameInput = settingsDialog.getByRole('textbox', { name: '备注名称' })
  await expect(nameInput).toBeFocused()
  await expect(nameInput).toHaveValue('Personal')
  const settingsHeight = await settingsDialog.evaluate((element) => element.offsetHeight)
  await nameInput.fill('Work iCloud')
  await settingsDialog.getByRole('button', { name: '保存备注' }).click()
  await expect.poll(() => state.accountNames).toEqual(['Work iCloud'])
  await expect(page.locator('.toast')).toHaveText('备注名称已保存')
  expect(Math.abs(await settingsDialog.evaluate((element) => element.offsetHeight)
    - settingsHeight)).toBeLessThanOrEqual(1)
  await expect(settingsDialog.getByRole('status')).toHaveCount(0)
  await expect(settingsDialog).toHaveAccessibleName('设置 Work iCloud')

  await settingsDialog.getByRole('textbox', { name: '新 Cookie' }).fill('session=new-cookie')
  await settingsDialog.getByRole('button', { name: '验证并覆盖' }).click()
  await expect.poll(() => state.cookieUpdates).toEqual(['session=new-cookie'])
  await expect(page.locator('.toast')).toHaveText('Cookie 已更新')

  await settingsDialog.getByRole('textbox', { name: 'iCloud 邮箱' }).fill('work@icloud.com')
  await settingsDialog.getByLabel('新应用专用密码').fill('abcd-efgh-ijkl-mnop')
  await settingsDialog.getByRole('button', { name: '测试并覆盖' }).click()
  await expect.poll(() => state.passwordUpdates).toEqual([{
    icloudEmail: 'work@icloud.com', appPassword: 'abcd-efgh-ijkl-mnop',
  }])
  await expect(page.locator('.toast')).toHaveText('应用专用密码已更新')
  await expect(settingsDialog.getByRole('button', { name: '删除这个 iCloud 账号' }))
    .toHaveClass(/icloud-danger-button/)

  await page.setViewportSize({ width: 375, height: 812 })
  expect(await settingsDialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true)
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true)
  await page.setViewportSize({ width: 2048, height: 1150 })
  await settingsDialog.getByRole('button', { name: '关闭' }).click()

  await page.getByRole('button', { name: /当前 iCloud.*Work iCloud/ }).click()
  scopeDialog = page.getByRole('dialog', { name: '选择查看范围' })
  await scopeDialog.getByRole('button', { name: '复制邮箱地址：shop@icloud.com' }).click()
  await expect(page.getByRole('status')).toContainText('已复制：shop@icloud.com')
  await expect(scopeDialog).toBeVisible()
  await scopeDialog.getByRole('button', { name: /Shopping/ }).click()
  await page.getByRole('button', { name: '复制', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已复制：shop@icloud.com')

  await page.getByRole('button', { name: /Your receipt/ }).click()
  const sender = page.locator('.icloud-reader-sender')
  await expect(sender.locator('strong')).toHaveText('GitHub')
  const relay = sender.getByText('通过 iCloud 隐藏邮箱转发')
  await expect(sender.locator('strong')).toHaveCSS('font-size', '14px')
  await expect(relay).toHaveCSS('font-size', '12px')
  await expect(sender.locator('time')).toHaveCSS('font-size', '12px')
  await expect(relay).toHaveAttribute(
    'title',
    'noreply_at_github_com_22h56q5td86002_47bfb5aa@icloud.com',
  )
  await expect(sender).not.toContainText('noreply_at_github_com')
  const messageFrame = page.frameLocator('iframe[title^="邮件正文"]')
  await expect(messageFrame.getByRole('heading', { name: 'Full receipt body.' })).toBeVisible()
  await expect(messageFrame.getByRole('img', { name: 'GitHub' })).toHaveJSProperty('naturalWidth', 120)
  await expect(messageFrame.getByText('unsafe')).toHaveCount(0)
  const readerContent = page.locator('.icloud-reader .reader-content')
  await readerContent.evaluate((element) => { element.scrollTop = element.scrollHeight })
  const toolbarSubject = page.getByRole('button', { name: '回到顶部：Your receipt' })
  const readerScrollTop = page.locator('.icloud-reader .reader-scroll-top')
  await expect(toolbarSubject).toBeVisible()
  await expect(readerScrollTop).toHaveClass(/is-visible/)
  await toolbarSubject.click()
  await expect.poll(() => readerContent.evaluate((element) => element.scrollTop)).toBe(0)
  await readerContent.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(readerScrollTop).toHaveClass(/is-visible/)
  await readerScrollTop.click()
  await expect.poll(() => readerContent.evaluate((element) => element.scrollTop)).toBe(0)
  await messageFrame.getByRole('link', { name: 'Open receipt' }).click()
  const externalLink = page.getByRole('alertdialog')
  await expect(externalLink).toContainText('github.com')
  await externalLink.getByRole('button', { name: '取消' }).click()
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(page.getByRole('button', { name: '返回邮件列表' })).toBeVisible()
  await page.getByRole('button', { name: '返回邮件列表' }).click()
  await expect(page.locator('iframe[title^="邮件正文"]')).toBeHidden()
  await expect(page.getByRole('button', { name: /Your receipt/ })).toBeVisible()
  await page.getByRole('button', { name: /Your receipt/ }).click()
  await expect(page.locator('iframe[title^="邮件正文"]')).toBeVisible()
  expect(state.messageReads).toHaveLength(1)
})

test('uses the branded danger dialog before deleting an iCloud account', async ({ page }) => {
  const state = await mockICloud(page)
  await page.goto('/icloud')

  await page.getByRole('button', { name: /当前 iCloud.*Personal/ }).click()
  const scopeDialog = page.getByRole('dialog', { name: '选择查看范围' })
  await scopeDialog.getByRole('button', { name: '设置 iCloud 账号：Personal' }).click()
  const settingsDialog = page.getByRole('dialog', { name: '设置 Personal' })
  const deleteButton = settingsDialog.getByRole('button', { name: '删除这个 iCloud 账号' })
  await deleteButton.click()

  let confirm = page.getByRole('alertdialog', { name: '删除 iCloud 账号？' })
  await expect(confirm).toContainText('账号“Personal”将从 OmniMail 中移除。')
  await expect(confirm).toContainText('此操作无法撤销')
  await expect(confirm).toContainText('Apple 账号和已有隐藏邮箱不会受影响')
  await expect(confirm.getByRole('button', { name: '取消' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  await expect(settingsDialog).toBeVisible()
  await expect(deleteButton).toBeFocused()

  await deleteButton.click()
  confirm = page.getByRole('alertdialog', { name: '删除 iCloud 账号？' })
  await confirm.getByRole('button', { name: '删除账号' }).click()
  await expect.poll(() => state.deletedAccountIds).toEqual(['icloud-1'])
  await expect(confirm).toBeHidden()
  await expect(page.getByText('还没有 iCloud 账号')).toBeVisible()
})
test('rejects an iCloud account without membership access without signing out', async ({ page }) => {
  await mockICloud(page, { rejectAccountCreate: true })
  await page.goto('/icloud')

  await page.getByRole('button', { name: '添加 iCloud 账号' }).click()
  const dialog = page.getByRole('dialog', { name: '添加 iCloud 账号' })
  await expect(dialog).toContainText('Cookie 仅用于管理隐藏邮箱')
  await dialog.getByRole('textbox', { name: '账号名称' }).fill('Web only')
  await dialog.locator('textarea').fill('session=web-only')
  await dialog.getByRole('button', { name: '验证并添加' }).click()

  await expect(dialog.getByRole('alert')).toContainText('添加失败')
  await expect(dialog.getByRole('alert')).toContainText('未开通 iCloud+')
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(/\/icloud$/)
  await expect(page.getByRole('heading', { name: 'iCloud', exact: true })).toBeVisible()
  await expect(page.getByText('Personal')).toBeVisible()
})

test('adds optional IMAP credentials together with an iCloud account', async ({ page }) => {
  const state = await mockICloud(page)
  await page.goto('/icloud')

  await page.getByRole('button', { name: '添加 iCloud 账号' }).click()
  const dialog = page.getByRole('dialog', { name: '添加 iCloud 账号' })
  const warning = dialog.locator('.icloud-account-warning')
  await expect(warning).toContainText('至少配置一种')
  expect(Number.parseFloat(await warning.evaluate((element) => getComputedStyle(element).fontSize)))
    .toBeGreaterThanOrEqual(13)
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect((await dialog.locator('.icloud-app-password-fields').evaluate((element) => (
    getComputedStyle(element).gridTemplateColumns.split(' ').length
  )))).toBe(1)
  await dialog.getByRole('textbox', { name: '账号名称' }).fill('Work')
  await dialog.locator('textarea').fill('session=valid-cookie')
  await dialog.getByRole('textbox', { name: 'iCloud 邮箱' }).fill('work@icloud.com')
  await dialog.getByLabel('应用专用密码', { exact: true }).fill('abcd-efgh-ijkl-mnop')
  await dialog.getByRole('button', { name: '验证并添加' }).click()

  await expect.poll(() => state.accountCreates).toEqual([{
    name: 'Work',
    host: 'icloud.com',
    cookies: 'session=valid-cookie',
    icloudEmail: 'work@icloud.com',
    appPassword: 'abcd-efgh-ijkl-mnop',
  }])
  await expect(dialog).toBeHidden()
})

test('explains Cookie summary mode before an app-specific password is configured', async ({ page }) => {
  await mockICloud(page, { hasAppPassword: false })
  await page.goto('/icloud')

  const status = page.locator('.icloud-mail-status')
  await expect(status).toHaveText(/Web 摘要/)
  await expect(page.locator('.icloud-list-context')).toHaveCount(0)
  const statusBox = await status.boundingBox()
  const actionsBox = await page.locator('.icloud-header-action-buttons').boundingBox()
  expect(Math.abs(
    (statusBox?.x || 0) + (statusBox?.width || 0)
      - (actionsBox?.x || 0) - (actionsBox?.width || 0),
  )).toBeLessThanOrEqual(1)
  expect((statusBox?.y || 0) + (statusBox?.height || 0)).toBeLessThanOrEqual(actionsBox?.y || 0)
  await page.getByRole('button', { name: /Your receipt/ }).click()
  await expect(page.getByText('当前显示 iCloud Web 摘要')).toBeVisible()
})

test('creates five labeled Hide My Email addresses in one batch', async ({ page }) => {
  const state = await mockICloud(page)
  await page.goto('/icloud')

  await page.getByRole('button', { name: '创建隐藏邮箱' }).click()
  const dialog = page.getByRole('dialog', { name: '创建隐藏邮箱' })
  await expect(dialog.getByText('preview-one@icloud.com', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: /换一个地址/ }).click()
  await expect(dialog.getByText('github-1@icloud.com', { exact: true })).toBeVisible()
  const firstDraftWidth = await dialog.locator('.icloud-alias-preview').first()
    .evaluate((element) => element.getBoundingClientRect().width)
  for (let index = 2; index <= 5; index += 1) {
    await dialog.getByRole('button', { name: /增加邮箱/ }).click()
    await expect(dialog.getByText(`github-${index}@icloud.com`, { exact: true })).toBeVisible()
    if (index === 2) {
      expect(await dialog.locator('.icloud-alias-preview').first()
        .evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(firstDraftWidth, 1)
    }
  }
  await expect(dialog.getByText('5/5', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '增加邮箱' })).toBeDisabled()
  expect(state.previewedEmails).toEqual([
    'preview-one@icloud.com', 'github-1@icloud.com', 'github-2@icloud.com',
    'github-3@icloud.com', 'github-4@icloud.com', 'github-5@icloud.com',
  ])
  const draftGrid = dialog.locator('.icloud-alias-drafts')
  expect((await draftGrid.evaluate((element) => (
    getComputedStyle(element).gridTemplateColumns.split(' ').length
  )))).toBe(2)
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect((await draftGrid.evaluate((element) => (
    getComputedStyle(element).gridTemplateColumns.split(' ').length
  )))).toBe(1)
  await page.setViewportSize({ width: 1280, height: 720 })
  const labelInputs = dialog.getByRole('textbox', { name: '用途标签（可选）' })
  await expect(dialog.getByRole('button', { name: '自动生成' })).toHaveAttribute('aria-pressed', 'true')
  await labelInputs.nth(0).focus()
  await dialog.getByRole('button', { name: '购物' }).click()
  await expect(labelInputs.nth(0)).toHaveValue('购物')
  for (let index = 0; index < 5; index += 1) {
    await labelInputs.nth(index).fill(`GITHUB${index + 1}`)
  }
  await dialog.getByRole('button', { name: '创建 5 个' }).click()
  await expect(dialog.getByRole('progressbar', { name: '创建进度' })).toBeVisible()
  await expect(dialog.getByText(/创建进度 \d\/5/)).toBeVisible()
  await expect(dialog.locator('.icloud-alias-preview.is-success')).toHaveCount(1)
  await expect(dialog.getByText('创建成功')).toBeVisible()
  await expect(dialog.locator('.icloud-alias-preview')).toHaveCount(4)

  await expect(page.locator('.icloud-list-context'))
    .toContainText('github-5@icloud.com')
  expect(state.createdLabels).toEqual(['GITHUB1', 'GITHUB2', 'GITHUB3', 'GITHUB4', 'GITHUB5'])
  expect(state.createdEmails).toEqual([
    'github-1@icloud.com', 'github-2@icloud.com', 'github-3@icloud.com',
    'github-4@icloud.com', 'github-5@icloud.com',
  ])
  expect(state.createdPreviewIds).toEqual([
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000006',
  ])
  await expect.poll(() => state.inboxAliases.at(-1)).toBe('github-5@icloud.com')
})

test('keeps uncreated aliases available after a partial batch failure', async ({ page }) => {
  const state = await mockICloud(page, { failCreateAt: 3 })
  await page.goto('/icloud')

  await page.getByRole('button', { name: '创建隐藏邮箱' }).click()
  const dialog = page.getByRole('dialog', { name: '创建隐藏邮箱' })
  await expect(dialog.getByText('preview-one@icloud.com', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: /增加邮箱/ }).click()
  await expect(dialog.getByText('github-1@icloud.com', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: /增加邮箱/ }).click()
  await expect(dialog.getByText('github-2@icloud.com', { exact: true })).toBeVisible()
  const labels = dialog.getByRole('textbox', { name: '用途标签（可选）' })
  await labels.nth(0).fill('ONE')
  await labels.nth(1).fill('TWO')
  await labels.nth(2).fill('THREE')
  await dialog.getByRole('button', { name: '创建 3 个' }).click()

  await expect(dialog).toBeVisible()
  await expect(dialog.locator('p.inline-error')).toContainText('已创建 2 个')
  await expect(dialog.getByRole('textbox', { name: '用途标签（可选）' })).toHaveValue('THREE')
  await expect(dialog.getByText('github-2@icloud.com', { exact: true })).toBeVisible()
  await expect(dialog.locator('.icloud-alias-preview')).toHaveClass(/is-error/)
  await expect(dialog.getByRole('button', { name: '创建 1 个' })).toBeEnabled()
  expect(state.createdLabels).toEqual(['ONE', 'TWO'])
})

test('allows iCloud to create an automatic purpose label', async ({ page }) => {
  const state = await mockICloud(page)
  await page.goto('/icloud')

  await page.getByRole('button', { name: '创建隐藏邮箱' }).click()
  const dialog = page.getByRole('dialog', { name: '创建隐藏邮箱' })
  await expect(dialog.getByText('preview-one@icloud.com', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '用途标签（可选）' }))
    .not.toHaveAttribute('required')
  await dialog.getByRole('button', { name: '创建 1 个' }).click()

  expect(state.createdLabels).toEqual([''])
  expect(state.createdEmails).toEqual(['preview-one@icloud.com'])
  expect(state.createdPreviewIds).toEqual(['00000000-0000-4000-8000-000000000001'])
  await expect(page.locator('.icloud-list-context'))
    .toContainText('preview-one@icloud.com')
})
