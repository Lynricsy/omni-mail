import { strict as assert } from 'node:assert'

export async function verifyEnglishPanel(page, frame) {
  await frame.getByRole('radio', { name: 'English' }).click()
  await page.waitForTimeout(300)
  const settingsText = (await frame.locator('body').innerText()).replace('简体中文', '')
  assert.doesNotMatch(settingsText, /[\u3400-\u9fff]/)
  await frame.locator('.panel-nav').getByRole('button', { name: 'Generate' }).click()
  await frame.getByRole('heading', { name: 'Quick mailbox generator' }).waitFor()
  assert.doesNotMatch(await frame.locator('body').innerText(), /[\u3400-\u9fff]/)
  await frame.getByRole('button', { name: 'Open Gmail inbox' }).click()
  await frame.getByRole('heading', { name: 'Gmail Inbox' }).waitFor()
  assert.doesNotMatch(await frame.locator('body').innerText(), /[\u3400-\u9fff]/)
  await frame.locator('.panel-nav').getByRole('button', { name: 'Settings' }).click()
  await frame.getByRole('heading', { name: 'Extension settings' }).waitFor()
  await frame.getByRole('radio', { name: '简体中文' }).click()
  await page.waitForTimeout(300)
}
