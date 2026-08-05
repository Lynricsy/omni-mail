import type { Page } from '@playwright/test'

async function messageRowCenter(page: Page, index: number) {
  const box = await page.locator('.message-row__main').nth(index).boundingBox()
  if (!box) throw new Error(`Drag selection row ${index} is not visible`)
  return { x: box.x + 24, y: box.y + box.height / 2 }
}

export async function beginMessageRowDrag(page: Page, index: number) {
  const start = await messageRowCenter(page, index)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x, start.y + 8)
  await page.locator('.message-list.is-bulk-mode').waitFor()
}

export async function moveMessageRowDrag(page: Page, index: number) {
  const position = await messageRowCenter(page, index)
  await page.mouse.move(position.x, position.y, { steps: 8 })
}

export async function endMessageRowDrag(page: Page) {
  await page.mouse.up()
}
