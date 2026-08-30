import { expect, type Page, test } from '@playwright/test'

async function renderMailboxHeader(page: Page, paneWidth: number) {
  await page.setContent(`
    <section class="list-pane" style="width:${paneWidth}px;height:400px">
      <header class="list-header mailbox-list-header">
        <div class="list-header__scope-row">
          <div class="mailbox-switcher">
            <button class="mailbox-scope-trigger" type="button">
              <span>当前邮箱</span>
              <strong>所有邮箱</strong>
              <svg width="14" height="14"></svg>
            </button>
          </div>
          <div class="list-header__utilities">
            <button class="icon-button" type="button"></button>
          </div>
        </div>
        <div class="list-header__title-row">
          <h1>星标邮件</h1>
          <div class="list-header__actions">
            <button class="icon-button" type="button"></button>
            <button class="icon-button" type="button"></button>
            <button class="icon-button" type="button"></button>
            <button class="icon-button" type="button"></button>
          </div>
        </div>
      </header>
    </section>
  `)
  await page.addStyleTag({ path: 'src/app/styles/base.css' })
  await page.addStyleTag({ path: 'src/features/mailbox/styles/mailbox.css' })
  await page.addStyleTag({ path: 'src/features/messages/styles/message-list.css' })
  await page.addStyleTag({ path: 'src/features/mailbox/styles/mailbox-header.css' })
  await page.addStyleTag({ path: 'src/features/mailbox/styles/mailbox-switcher.css' })
  await page.addStyleTag({ path: 'src/features/mailbox/styles/mailbox-switcher-responsive.css' })
  await page.addStyleTag({ path: 'src/app/styles/responsive.css' })
}

test('mailbox header actions stay inside narrow desktop list panes', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 })

  for (const paneWidth of [366, 330, 320]) {
    await renderMailboxHeader(page, paneWidth)
    const layout = await page.locator('.list-header').evaluate((header) => {
      const pane = header.parentElement!.getBoundingClientRect()
      const headerBox = header.getBoundingClientRect()
      const paddingRight = Number.parseFloat(getComputedStyle(header).paddingRight)
      const scope = header.querySelector('.mailbox-switcher')!.getBoundingClientRect()
      const utilities = header.querySelector<HTMLElement>('.list-header__utilities')!
      const title = header.querySelector('h1')!.getBoundingClientRect()
      const actions = header.querySelector('.list-header__actions')!.getBoundingClientRect()
      return {
        scopeInsidePane: scope.right <= pane.right + 1,
        utilitiesHidden: getComputedStyle(utilities).display === 'none',
        actionsInsidePane: actions.right <= pane.right + 1,
        actionsRightAligned: Math.abs(actions.right - (headerBox.right - paddingRight)) <= 1,
        titleClearOfActions: title.right <= actions.left || title.bottom <= actions.top,
        noHorizontalOverflow: header.scrollWidth <= header.clientWidth,
      }
    })

    expect(layout).toEqual({
      scopeInsidePane: true,
      utilitiesHidden: true,
      actionsInsidePane: true,
      actionsRightAligned: true,
      titleClearOfActions: true,
      noHorizontalOverflow: true,
    })
  }

  await page.setViewportSize({ width: 375, height: 700 })
  await renderMailboxHeader(page, 375)
  await expect(page.locator('.list-header__utilities')).toBeVisible()
  expect(await page.locator('.list-header').evaluate((header) => (
    header.scrollWidth <= header.clientWidth
  ))).toBe(true)
})

test('notification control stays available across desktop and mobile layouts', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 })
  await page.setContent(`
    <aside class="mail-sidebar" style="width:230px;height:500px">
      <div class="sidebar-theme">
        <div class="theme-selector"><button></button><button></button><button></button></div>
        <button class="sidebar-notification-toggle" aria-label="侧栏通知"></button>
        <button class="language-quick-toggle">EN</button>
      </div>
    </aside>
    <section class="list-pane"><header class="list-header mailbox-list-header">
      <div class="list-header__scope-row">
        <div class="mailbox-switcher"><button class="mailbox-scope-trigger">所有邮箱</button></div>
        <div class="list-header__utilities"><button class="icon-button" aria-label="顶部通知"></button></div>
      </div>
    </header></section>
  `)
  for (const path of ['src/app/styles/base.css', 'src/features/mailbox/styles/mailbox.css',
    'src/features/messages/styles/message-list.css', 'src/features/mailbox/styles/mailbox-header.css',
    'src/features/mailbox/styles/mailbox-switcher.css',
    'src/features/mailbox/styles/mailbox-switcher-responsive.css',
    'src/shared/ui/language/language.css', 'src/app/styles/responsive.css']) {
    await page.addStyleTag({ path })
  }

  await expect(page.getByRole('button', { name: '侧栏通知' })).toBeVisible()
  await expect(page.getByRole('button', { name: '顶部通知' })).toBeHidden()
  expect(await page.locator('.sidebar-theme').evaluate((row) => row.scrollWidth <= row.clientWidth)).toBe(true)

  await page.setViewportSize({ width: 1000, height: 700 })
  await expect(page.getByRole('button', { name: '侧栏通知' })).toBeVisible()
  await expect(page.locator('.sidebar-theme')).toHaveCSS('flex-direction', 'column')

  await page.setViewportSize({ width: 375, height: 700 })
  await expect(page.getByRole('button', { name: '侧栏通知' })).toBeHidden()
  await expect(page.getByRole('button', { name: '顶部通知' })).toBeVisible()
})

test('external mail headers keep their single-row layout', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 })
  await page.setContent(`
    <section class="list-pane icloud-list-pane" style="width:370px;height:500px">
      <header class="list-header icloud-list-header">
        <div><small>ICLOUD</small><h1>iCloud</h1></div>
        <div class="list-header__actions">
          <span>IMAP 完整邮件</span>
          <div class="icloud-header-action-buttons">
            <button class="icon-button"></button><button class="icon-button"></button>
            <button class="icon-button"></button><button class="icon-button"></button>
          </div>
        </div>
      </header>
    </section>
  `)
  for (const path of ['src/app/styles/base.css', 'src/features/mailbox/styles/mailbox.css',
    'src/features/messages/styles/message-list.css', 'src/features/mailbox/styles/mailbox-header.css',
    'src/shared/ui/mail-workspace/styles/workspace.css', 'src/app/styles/responsive.css']) {
    await page.addStyleTag({ path })
  }
  const layout = await page.locator('.icloud-list-header').evaluate((header) => {
    const title = header.firstElementChild!.getBoundingClientRect()
    const actions = header.querySelector('.list-header__actions')!.getBoundingClientRect()
    return {
      display: getComputedStyle(header).display,
      titleAndActionsShareRow: title.right <= actions.left,
      noHorizontalOverflow: header.scrollWidth <= header.clientWidth,
    }
  })
  expect(layout).toEqual({
    display: 'flex',
    titleAndActionsShareRow: true,
    noHorizontalOverflow: true,
  })
})

test('iCloud workspace loading state does not use an admin card', async ({ page }) => {
  await page.setContent(`
    <section class="list-pane icloud-list-pane" style="width:370px;height:700px">
      <div class="icloud-workspace-loading" role="status">
        <span class="icloud-workspace-loading__icon"><svg></svg></span>
        <span><strong>正在打开 iCloud 收件箱…</strong><small>正在准备邮件布局</small></span>
      </div>
    </section>
  `)
  for (const path of ['src/app/styles/base.css', 'src/features/mailbox/styles/mailbox.css',
    'src/features/messages/styles/message-list.css', 'src/shared/ui/mail-workspace/styles/workspace.css']) {
    await page.addStyleTag({ path })
  }
  const loading = page.getByRole('status')
  await expect(loading).toBeVisible()
  await expect(loading).toHaveCSS('border-top-width', '0px')
  await expect(loading).toHaveCSS('box-shadow', 'none')
  expect(await loading.evaluate((element) => (
    element.getBoundingClientRect().width === element.parentElement!.clientWidth
  ))).toBe(true)
})
