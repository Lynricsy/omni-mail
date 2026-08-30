import { strict as assert } from 'node:assert'

export async function verifyThemeSwitch(page, panelFrame, serviceWorker) {
  await panelFrame.locator('.panel-nav').getByRole('button', { name: '设置', exact: true }).click()
  const system = panelFrame.getByRole('button', { name: /跟随系统/ })
  const light = panelFrame.getByRole('button', { name: /^亮色/ })
  const dark = panelFrame.getByRole('button', { name: /^暗色/ })
  await system.waitFor()
  assert.equal(await system.getAttribute('aria-pressed'), 'true')

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
