import { expect, test } from '@playwright/test'
import { message, user } from './omnimail-fixtures'

test('desktop users can act on one message from its context menu', async ({ page }) => {
  let version = 1
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config') return route.fulfill({ json: {
      appName: 'OmniMail', setupComplete: true, replyEnabled: false,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '',
      mailRefreshInterval: 30, remoteImagesEnabled: false,
      unassignedMailEnabled: false, superAdminEmail: user.email,
      setupRequirements: {
        databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false,
      },
    } })
    if (path === '/api/session') return route.fulfill({ json: { user } })
    if (path === '/api/mailboxes') return route.fulfill({ json: { mailboxes: [{
      address: 'inbox@example.com', domain: 'example.com',
      isPrimary: true, isActive: true,
    }] } })
    if (path === '/api/domains') return route.fulfill({ json: { domains: [{
      name: 'example.com', isActive: true, mailboxCount: 1,
      createdAt: 1, updatedAt: 1,
    }] } })
    if (path === '/api/messages/bulk' && request.method() === 'PATCH') {
      version += 1
      const input = request.postDataJSON() as { ids: string[] }
      return route.fulfill({ json: { ok: true, updatedCount: input.ids.length } })
    }
    if (path === '/api/messages') return route.fulfill({ json: {
      unchanged: false, version, messages: [message],
      counts: { unread: 0, starred: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    } })
    return route.fulfill({ status: 404, json: { error: 'Not found' } })
  })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const row = page.locator('.message-row').first()
  await row.dispatchEvent('contextmenu', { button: 2, clientX: 1278, clientY: 798 })
  const menu = page.getByRole('menu', { name: '邮件操作' })
  await expect(menu.getByRole('menuitem')).toHaveCount(3)
  await expect(menu.getByRole('menuitem', { name: '标记为未读' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '添加星标' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '移入垃圾箱' })).toBeVisible()
  const menuRect = await menu.boundingBox()
  expect(menuRect).not.toBeNull()
  expect(menuRect!.x + menuRect!.width).toBeLessThanOrEqual(1272)
  expect(menuRect!.y + menuRect!.height).toBeLessThanOrEqual(792)

  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await row.click({ button: 'right' })
  const starRequest = page.waitForRequest((request) => (
    new URL(request.url()).pathname === '/api/messages/bulk'
      && request.method() === 'PATCH'
      && request.postDataJSON().action === 'star'
  ))
  await menu.getByRole('menuitem', { name: '添加星标' }).click()
  expect((await starRequest).postDataJSON()).toEqual({
    ids: ['message-1'],
    action: 'star',
  })
  await expect(menu).toHaveCount(0)

  await row.click({ button: 'right' })
  await menu.getByRole('menuitem', { name: '移入垃圾箱' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('您可以在自动清理前恢复')
  await page.getByRole('alertdialog').getByRole('button', { name: '取消' }).click()

  await page.getByRole('button', { name: '垃圾箱' }).click()
  await expect(page.getByRole('heading', { name: '垃圾箱' })).toBeVisible()
  await expect(row).toBeVisible()
  await row.dispatchEvent('contextmenu', { button: 2, clientX: 600, clientY: 300 })
  await expect(menu.getByRole('menuitem')).toHaveCount(2)
  await expect(menu.getByRole('menuitem', { name: '恢复邮件' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: '永久删除' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 393, height: 800 })
  await row.click({ button: 'right' })
  await expect(menu).toHaveCount(0)
})
