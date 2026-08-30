import { expect, type Route, test } from '@playwright/test'
import { user } from './omnimail-fixtures'

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

test('filters detailed QQ Mail audit entries without overflowing the category bar', async ({ page }) => {
  let requestedCategory = ''
  await page.setViewportSize({ width: 1160, height: 760 })
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: true,
      registrationAvailable: false, registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] }, turnstileSiteKey: '',
      mailRefreshInterval: 30, remoteImagesEnabled: false, unassignedMailEnabled: false,
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (url.pathname === '/api/session') return json(route, { user })
    if (url.pathname === '/api/mailboxes') return json(route, { mailboxes: [{
      address: 'owner@example.com', domain: 'example.com', isPrimary: true, isActive: true,
    }] })
    if (url.pathname === '/api/domains') return json(route, { domains: [{
      name: 'example.com', isActive: true, mailboxCount: 1, createdAt: 1, updatedAt: 1,
    }] })
    if (url.pathname === '/api/messages') return json(route, {
      unchanged: false, version: 1, messages: [],
      counts: { unread: 0, starred: 0, drafts: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    if (url.pathname === '/api/admin/version') return json(route, {
      currentVersion: '0.9.1', latestVersion: '0.9.1', updateAvailable: false,
      checkFailed: false, checkedAt: Date.now(), releaseUrl: '',
    })
    if (url.pathname === '/api/admin/audit-logs') {
      requestedCategory = url.searchParams.get('category') || ''
      return json(route, {
        logs: requestedCategory === 'qq-mail' ? [{
          id: 1, actor: { id: user.id, email: user.email, displayName: user.displayName,
            role: user.role }, action: 'qq_mail.sync.failed', targetId: 'qq-1',
          target: { id: 'qq-1', email: null, displayName: '工作 QQ' }, ip: 'queue',
          detail: { accountName: '工作 QQ', email: '12***@qq.com', reason: 'manual',
            attempt: 2, limit: 20, stage: 'fetch_metadata', errorCode: 'sync_failed',
            errorType: 'ImapConnectionError', errorMessage: 'QQ 邮箱 FETCH 响应缺少有效 UID。',
            errorStatus: 502, durationMs: 1432, willRetry: true }, createdAt: 1_787_980_000,
        }] : [],
        page: { hasMore: false, nextCursor: null, limit: 50 },
        summary: { total: requestedCategory === 'qq-mail' ? 1 : 0,
          loginSuccess: 0, loginFailed: 0 },
      })
    }
    return json(route, { error: `${request.method()} ${url.pathname}` }, 404)
  })

  await page.goto('/'); await page.getByRole('button', { name: '操作日志' }).click()
  const categories = page.getByLabel('日志类型')
  await categories.getByRole('button', { name: 'QQ 邮箱' }).click()
  await expect.poll(() => requestedCategory).toBe('qq-mail')
  await expect(page.getByText('QQ 邮箱同步失败')).toBeVisible()
  await expect(page.getByText(/阶段：读取邮件元数据/)).toBeVisible()
  await expect(page.getByText(/错误码：sync_failed/)).toBeVisible()
  await expect(page.getByText(/系统将自动重试/)).toBeVisible()
  expect(await categories.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)

  const detailTrigger = page.getByRole('button', { name: '查看日志详情：QQ 邮箱同步失败' })
  await detailTrigger.click()
  const dialog = page.getByRole('dialog', { name: 'QQ 邮箱同步失败' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('qq_mail.sync.failed')).toBeVisible()
  await expect(dialog.getByText('阶段：读取邮件元数据')).toBeVisible()
  await expect(dialog.getByText('错误码：sync_failed')).toBeVisible()
  await expect(dialog.getByText('错误类型：ImapConnectionError')).toBeVisible()
  await expect(dialog.getByText('错误说明：QQ 邮箱 FETCH 响应缺少有效 UID。')).toBeVisible()
  await expect(dialog.getByText('状态码：502')).toBeVisible()
  await expect(dialog.getByText('耗时：1432 ms')).toBeVisible()
  await expect(dialog.getByText('系统将自动重试')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(detailTrigger).toBeFocused()

  await page.setViewportSize({ width: 375, height: 720 })
  await detailTrigger.click()
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
})
