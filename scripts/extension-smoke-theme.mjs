import { strict as assert } from 'node:assert'

export async function verifyThemeSwitch(page, panelFrame, serviceWorker) {
  await panelFrame.locator('.panel-nav').getByRole('button', { name: '设置', exact: true }).click()
  const system = panelFrame.getByRole('button', { name: /跟随系统/ })
  const light = panelFrame.getByRole('button', { name: /^亮色/ })
  const dark = panelFrame.getByRole('button', { name: /^暗色/ })
  await system.waitFor()
  assert.equal(await system.getAttribute('aria-pressed'), 'true')
  const themeButtons = panelFrame.locator('.theme-options > button')
  assert.equal(await themeButtons.count(), 3)
  assert.equal(await panelFrame.locator('.theme-setting-heading').evaluate((element) => (
    getComputedStyle(element).display
  )), 'grid')
  for (const button of await themeButtons.all()) {
    const box = await button.boundingBox()
    assert(box && box.height >= 48 && box.width >= 250)
    assert.equal(await button.evaluate((element) => getComputedStyle(element).display), 'grid')
  }

  await light.click()
  await page.emulateMedia({ colorScheme: 'dark' })
  assert.equal(await panelFrame.locator('html').getAttribute('data-theme'), 'light')
  await page.locator('[data-omnimail-theme="light"]').waitFor({ state: 'attached' })
  await page.waitForTimeout(220)
  await page.screenshot({ path: 'test-results/extension-theme-light.png' })

  await dark.click()
  await page.emulateMedia({ colorScheme: 'light' })
  assert.equal(await panelFrame.locator('html').getAttribute('data-theme'), 'dark')
  await page.locator('[data-omnimail-theme="dark"]').waitFor({ state: 'attached' })
  assert.equal((await serviceWorker.evaluate(() => chrome.storage.local.get('theme'))).theme, 'dark')
  await page.waitForTimeout(220)
  await page.screenshot({ path: 'test-results/extension-theme-dark.png' })
}

export async function verifyThemeRestored(page, panelFrame) {
  assert.equal(await panelFrame.locator('html').getAttribute('data-theme'), 'dark')
  await page.locator('[data-omnimail-theme="dark"]').waitFor({ state: 'attached' })
}

export async function verifyNarrowPanel(context, serviceWorker) {
  const narrowPage = await context.newPage()
  await narrowPage.setViewportSize({ width: 375, height: 720 })
  await narrowPage.goto(`chrome-extension://${serviceWorker.url().split('/')[2]}/panel.html`)
  await narrowPage.getByRole('heading', { name: '快速生成邮箱' }).waitFor()
  const scrollWidth = await narrowPage.locator('body').evaluate((element) => element.scrollWidth)
  assert(scrollWidth <= 375)
  await narrowPage.emulateMedia({ reducedMotion: 'reduce' })
  const duration = await narrowPage.locator('.panel-view')
    .evaluate((element) => getComputedStyle(element).animationDuration)
  assert(['0.01ms', '1e-05s'].includes(duration))
  await narrowPage.close()
}
