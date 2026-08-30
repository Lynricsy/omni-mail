import { expect, type Page, type Route, test } from '@playwright/test'
import { user } from './omnimail-fixtures'

type RateSettings = { enabled: boolean; minuteLimit: number; dayLimit: number }

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockRateLimitAdmin(page: Page) {
  const state = {
    settings: { enabled: true, minuteLimit: 10, dayLimit: 200 } as RateSettings,
    minuteLimit: null as number | null,
    dayLimit: null as number | null,
    minuteUsed: 3,
    dayUsed: 20,
    draftLimits: { superAdmin: 5, admin: 5, user: 5, temporary: 5 },
  }
  const rateState = () => ({
    ...state.settings,
    minuteLimit: state.minuteLimit ?? state.settings.minuteLimit,
    dayLimit: state.dayLimit ?? state.settings.dayLimit,
    minuteLimitOverride: state.minuteLimit,
    dayLimitOverride: state.dayLimit,
    minuteUsed: state.minuteUsed,
    dayUsed: state.dayUsed,
    minuteResetsAt: Math.floor(Date.now() / 60_000) * 60 + 60,
    dayResetsAt: Math.floor(Date.now() / 86_400_000) * 86_400 + 86_400,
  })
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: true,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '', mailRefreshInterval: 30,
      remoteImagesEnabled: false, unassignedMailEnabled: false,
      superAdminEmail: user.email,
      setupRequirements: { databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false },
    })
    if (path === '/api/session') return json(route, { user })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/messages') return json(route, {
      unchanged: false, version: 1, messages: [],
      counts: { unread: 0, starred: 0, drafts: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    if (path === '/api/admin/settings/storage' && request.method() === 'GET') return json(route, { storagePolicy: {
      backupEnabled: false, backupReady: false, backupMissing: [],
      backupRetention: { dailyDays: 30, weeklyDays: 84, monthlyDays: 365, mailDays: 90 },
      trashRetentionDays: 30, temporaryDataRetentionDays: 30,
      auditRetentionDays: 365, failedMessageRetentionDays: 7,
      defaultUserQuotaMiB: 1024, defaultTemporaryQuotaMiB: 256,
      draftLimits: state.draftLimits, lastBackup: null,
    } })
    if (path === '/api/admin/settings/storage' && request.method() === 'PATCH') {
      const input = request.postDataJSON() as { draftLimits: typeof state.draftLimits }
      state.draftLimits = input.draftLimits
      return json(route, { storagePolicy: {
        ...input, backupReady: false, backupMissing: [],
        backupRetention: { dailyDays: 30, weeklyDays: 84, monthlyDays: 365, mailDays: 90 },
        lastBackup: null,
      } })
    }
    if (path === '/api/admin/settings/outbound-rate-limit' && request.method() === 'GET') {
      return json(route, { outboundRateLimit: state.settings })
    }
    if (path === '/api/admin/settings/outbound-rate-limit' && request.method() === 'PATCH') {
      state.settings = request.postDataJSON() as RateSettings
      return json(route, { outboundRateLimit: state.settings })
    }
    if (path === '/api/admin/users' && request.method() === 'GET') return json(route, {
      users: [{
        id: 'managed-user-1', email: 'managed@example.com', displayName: 'Managed User',
        role: 'user', status: 'active', mailboxLimit: 1, mailboxCount: 0,
        storageQuotaBytes: 1024 ** 3, storageUsedBytes: 0,
        canCreateMailboxes: false, canReply: true, canTranslate: true,
        temporaryExpiresAt: null,
        outboundRateLimit: rateState(), createdAt: 1_700_000_000, updatedAt: 1_700_000_000,
      }],
      totals: { total: 1, active: 1, disabled: 0 },
      page: { hasMore: false, nextCursor: null, limit: 50 },
    })
    if (path === '/api/admin/users/managed-user-1/outbound-rate-limit'
      && request.method() === 'PATCH') {
      const input = request.postDataJSON() as { minuteLimit: number | null; dayLimit: number | null }
      state.minuteLimit = input.minuteLimit
      state.dayLimit = input.dayLimit
      return json(route, { outboundRateLimit: rateState() })
    }
    if (path === '/api/admin/users/managed-user-1/outbound-rate-limit/reset'
      && request.method() === 'POST') {
      state.minuteUsed = 0
      state.dayUsed = 0
      return json(route, { outboundRateLimit: rateState() })
    }
    return json(route, {})
  })
  return state
}

test('administrators can manage global and per-user outbound rate limits', async ({ page }) => {
  const state = await mockRateLimitAdmin(page)
  await page.goto('/admin/settings')
  const storage = page.locator('.storage-policy-card')
  await storage.getByLabel('主管理员').fill('8')
  await storage.getByRole('spinbutton', { name: '管理员 封', exact: true }).fill('7')
  await storage.getByRole('spinbutton', { name: '普通用户 封', exact: true }).fill('5')
  await storage.getByRole('spinbutton', { name: '临时用户 封', exact: true }).fill('3')
  await storage.getByRole('button', { name: '保存策略' }).click()
  await expect.poll(() => state.draftLimits).toEqual({
    superAdmin: 8, admin: 7, user: 5, temporary: 3,
  })
  await page.getByLabel('每分钟默认上限').fill('12')
  await page.getByLabel('每日默认上限').fill('300')
  await page.getByRole('button', { name: '保存限速设置' }).click()
  await expect.poll(() => state.settings).toEqual({
    enabled: true, minuteLimit: 12, dayLimit: 300,
  })

  await page.goto('/admin/users')
  await page.getByRole('button', { name: /Managed User/ }).click()
  const panel = page.locator('.user-panel')
  await expect(panel).toContainText('3 / 12')
  await panel.getByLabel('每分钟覆盖值').fill('5')
  await panel.getByLabel('每日覆盖值').fill('100')
  await panel.getByRole('button', { name: '保存限速' }).click()
  await expect.poll(() => state.minuteLimit).toBe(5)
  await expect(panel).toContainText('3 / 5')
  await panel.getByRole('button', { name: '清零当前计数' }).click()
  await expect.poll(() => state.minuteUsed).toBe(0)
  await expect(panel).toContainText('0 / 5')
})
