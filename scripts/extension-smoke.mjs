import { strict as assert } from 'node:assert'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import {
  deferred, extensionScopes, iCloudAccounts, iCloudAliases, iCloudMessage,
  float041Scopes,
  json, mailboxes, message, requestBody, user,
} from './extension-smoke-fixtures.mjs'
import { verifyThemeRestored, verifyThemeSwitch } from './extension-smoke-theme.mjs'
import {
  authorizeFromPanel, handleIndexedRequest, selectAndRememberSource,
  selectMailSource, upgradeMailSourceAuthorization, verifyIndexedSources,
  verifyRemainingSources,
} from './extension-smoke-indexed.mjs'
import { createPromoAsset } from './extension-smoke-promo.mjs'
const extensionPath = resolve('dist-extension')
const previewMode = process.argv.includes('--preview')
const updateStoreAssets = process.argv.includes('--update-store-assets')
const profilePath = await mkdtemp(resolve(tmpdir(), 'omnimail-extension-'))
const screenshotPath = resolve('test-results', 'extension-smoke.png')
const dropdownScreenshotPath = resolve('test-results', 'extension-dropdown-open.png')
const darkDropdownScreenshotPath = resolve('test-results', 'extension-dropdown-open-dark.png')
const storeAssetsPath = resolve('extension', 'store-assets')
const capturedAssetsPath = updateStoreAssets ? storeAssetsPath : resolve('test-results', 'extension-store-assets')
await mkdir(resolve('test-results'), { recursive: true })
let exchangeBody = null
let iCloudAliasBody = null
let iCloudAliasGate = null
let lastICloudInboxAlias = ''
let messageListRequests = 0
let lastMessageMailbox = ''
let messageGate = null
let refreshResponseStatus = 200
let exchangeCount = 0
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(`<!doctype html><html><head><title>Acme Account</title><style>
        *{box-sizing:border-box}body{margin:0;font:15px Inter,system-ui;color:#1d1d1f;background:#f4f5f7}
        nav{height:68px;padding:0 54px;display:flex;align-items:center;justify-content:space-between;background:white;border-bottom:1px solid #e5e7eb}
        .brand{font-size:20px;font-weight:750}.nav-links{color:#6b7280;word-spacing:24px}
        main{min-height:732px;display:grid;place-items:center;padding:48px}
        section{width:460px;padding:40px;border:1px solid #e1e4e8;border-radius:18px;background:white;box-shadow:0 20px 60px #11182712}
        h1{margin:0 0 10px;font-size:30px}.copy{margin:0 0 28px;color:#6b7280;line-height:1.6}
        label{display:grid;gap:9px;font-weight:650}input{height:48px;padding:0 14px;border:1px solid #cfd4dc;border-radius:10px;font:inherit}
        .continue{width:100%;height:48px;margin-top:22px;border:0;border-radius:10px;color:white;background:#1d1d1f;font-weight:700}
      </style></head><body><nav><span class="brand">Acme</span><span class="nav-links">产品 定价 帮助</span></nav>
        <main><section><h1>创建你的账户</h1><p class="copy">填写邮箱即可开始使用。OmniMail Float 能帮你快速生成并填入一个新地址。</p>
          <label>邮箱地址<input type="email" placeholder="name@example.com" /></label><button class="continue">继续</button>
        </section></main></body></html>`)
      return
    }
    if (url.pathname === '/extension/authorize') {
      const redirectUri = url.searchParams.get('redirect_uri') || ''
      const state = url.searchParams.get('state') || ''
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(`<!doctype html><html><head><title>Authorize OmniMail Float</title></head>
        <body style="font:16px system-ui;padding:40px;background:#f7f7f8">
          <main><h1>授权浏览器扩展</h1><p>OmniMail Float 希望连接你的账户。</p>
          <button id="allow" style="padding:12px 20px">允许访问</button></main>
          <script>document.querySelector('#allow').onclick = () => {
            location.assign(${JSON.stringify(`${redirectUri}?code=om_ac_${'a'.repeat(43)}&state=${state}`)})
          }</script>
        </body></html>`)
      return
    }
    if (url.pathname === '/api/auth/extension/exchange') {
      exchangeCount += 1
      exchangeBody = await requestBody(request)
      json(response, {
        accessToken: 'om_at_smoke_access_token_1234567890', expiresIn: 900,
        refreshToken: 'om_rt_smoke_refresh_token_1234567890', refreshExpiresIn: 2592000,
        scopes: exchangeCount === 1 ? float041Scopes : extensionScopes, user,
      })
      return
    }
    if (url.pathname === '/api/auth/token/refresh') {
      if (refreshResponseStatus !== 200) {
        json(response, { error: `Refresh failed (${refreshResponseStatus})` }, refreshResponseStatus)
        return
      }
      json(response, {
        accessToken: 'om_at_refreshed_access_token_123456', expiresIn: 900,
        refreshToken: 'om_rt_refreshed_refresh_token_123456', refreshExpiresIn: 2592000,
        scopes: extensionScopes, user,
      })
      return
    }
    if (url.pathname === '/api/auth/token/revoke') {
      json(response, { ok: true })
      return
    }
    if (url.pathname === '/api/config') {
      json(response, {
        appName: 'OmniMail', iCloudEnabled: true, iCloudWorkspaceEnabled: true,
        gmailEnabled: true, gmailWorkspaceEnabled: true,
        qqMailEnabled: true, qqMailWorkspaceEnabled: true,
        microsoftEnabled: true, microsoftWorkspaceEnabled: true,
        naverMailEnabled: true, naverMailWorkspaceEnabled: true,
        yandexMailEnabled: true, yandexMailWorkspaceEnabled: true,
        linuxDoMailWorkspaceEnabled: true,
        mailRefreshInterval: 5, randomMailboxPrefix: 'alias-',
      })
      return
    }
    if (handleIndexedRequest(url, response)) return
    if (url.pathname === '/api/icloud/accounts') {
      json(response, { accounts: iCloudAccounts })
      return
    }
    if (url.pathname === '/api/icloud/aliases' && request.method === 'GET') {
      const gate = iCloudAliasGate
      if (gate) {
        gate.started.resolve()
        await gate.release.promise
      }
      if (previewMode) await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_200))
      json(response, { aliases: iCloudAliases })
      return
    }
    if (url.pathname === '/api/icloud/aliases' && request.method === 'POST') {
      iCloudAliasBody = await requestBody(request)
      const alias = {
        email: 'float-preview@icloud.com',
        anonymousId: 'float-preview-1',
        label: iCloudAliasBody.label,
        active: true,
        createdAt: new Date().toISOString(),
      }
      iCloudAliases.push(alias)
      json(response, {
        alias,
      }, 201)
      return
    }
    if (url.pathname === '/api/icloud/inbox') {
      lastICloudInboxAlias = url.searchParams.get('alias') || ''
      json(response, { messages: [iCloudMessage], method: 'imap' })
      return
    }
    if (url.pathname === '/api/icloud/inbox/icloud-message-1') {
      json(response, { message: iCloudMessage })
      return
    }
    if (url.pathname === '/api/domains') {
      json(response, { domains: [
        'example.com', 'aicnos.com', 'cloudflare.aicnos.com', 'noetie.kdns.fr',
      ].map((name) => ({
        name, isActive: true, mailboxCount: mailboxes.filter((item) => item.domain === name).length,
        createdAt: 1, updatedAt: 1,
      })) })
      return
    }
    if (url.pathname === '/api/mailboxes' && request.method === 'GET') {
      json(response, { mailboxes })
      return
    }
    if (url.pathname === '/api/mailboxes' && request.method === 'POST') {
      const body = await requestBody(request)
      const mailbox = {
        address: body.address, domain: body.address.split('@')[1],
        isPrimary: false, isActive: true,
      }
      mailboxes.push(mailbox)
      json(response, { mailbox }, 201)
      return
    }
    if (url.pathname === '/api/messages') {
      messageListRequests += 1
      const requestedMailbox = url.searchParams.get('mailbox')
      lastMessageMailbox = requestedMailbox || ''
      const activeGate = messageGate
      if (activeGate?.mailbox === requestedMailbox) {
        activeGate.started.resolve()
        await activeGate.release.promise
      }
      const listedMessage = requestedMailbox
        ? { ...message, mailboxAddress: requestedMailbox, recipients: [requestedMailbox] }
        : message
      if (activeGate) listedMessage.subject = `Mail for ${requestedMailbox || 'all mailboxes'}`
      json(response, {
        unchanged: false, version: 1, messages: [listedMessage],
        counts: { unread: 1, starred: 0, drafts: 0, sent: 0, trash: 0 },
        page: { hasMore: false, nextCursor: null, limit: 30 },
      })
      if (activeGate?.mailbox === requestedMailbox) activeGate.completed.resolve()
      return
    }
    if (url.pathname === '/api/messages/message-1' && request.method === 'GET') {
      json(response, {
        message: {
          ...message, messageId: '<message-1@example.net>', inReplyTo: null,
          references: null, cc: [], text: 'Your code is 123456.',
          html: '<p>Your code is <strong>123456</strong>.</p>', attachments: [],
        },
        thread: [message],
      })
      return
    }
    if (url.pathname === '/api/messages/message-1' && request.method === 'PATCH') {
      json(response, { ok: true })
      return
    }
    json(response, { error: 'Not found' }, 404)
  } catch (error) {
    json(response, { error: error instanceof Error ? error.message : 'Server error' }, 500)
  }
})

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen)
  server.listen(0, '127.0.0.1', resolveListen)
})

const address = server.address()
assert(address && typeof address === 'object')
let context
try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: 'chromium',
    headless: !previewMode,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  })
  const serviceWorker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10_000 })
  assert.match(serviceWorker.url(), /^chrome-extension:\/\/[a-p]{32}\/background\.js$/)

  const page = await context.newPage()
  await page.goto(`http://localhost:${address.port}`)
  await page.waitForTimeout(500)
  const cdp = await context.newCDPSession(page)
  await cdp.send('DOM.enable')
  const nodeWithClass = (nodes, className) => nodes.find((node) => {
    const attributes = node.attributes || []
    const classIndex = attributes.indexOf('class')
    return classIndex >= 0 && attributes[classIndex + 1]?.split(/\s+/).includes(className)
  })
  const nodeAttribute = (node, name) => {
    const attributes = node.attributes || []
    const index = attributes.indexOf(name)
    return index >= 0 ? attributes[index + 1] : ''
  }
  const { nodes } = await cdp.send('DOM.getFlattenedDocument', { depth: -1, pierce: true })
  const floatButton = nodeWithClass(nodes, 'omnimail-float-button')
  assert(floatButton?.nodeId, 'floating button was not injected')

  const box = await cdp.send('DOM.getBoxModel', { nodeId: floatButton.nodeId })
  const [x1, y1, , , x3, y3] = box.model.content
  const x = (x1 + x3) / 2
  const y = (y1 + y3) / 2
  const panelFramePromise = page.waitForEvent('framenavigated', {
    predicate: (frame) => frame !== page.mainFrame() && frame.url().endsWith('/panel.html'),
    timeout: 10_000,
  })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })

  const panelFrame = await panelFramePromise
  await panelFrame.getByRole('heading', { name: '连接你的邮箱' }).waitFor()
  await panelFrame.getByText('授权后的数据使用').waitFor()
  assert.equal(
    await panelFrame.getByLabel('OmniMail 地址').getAttribute('aria-describedby'),
    'omnimail-data-disclosure',
  )
  const loginButton = panelFrame.getByRole('button', { name: '前往 OmniMail 授权' })
  await loginButton.click({ trial: true })
  await page.mouse.move(20, 20)
  await page.waitForTimeout(220)
  const buttonState = await loginButton.evaluate((button) => ({
    disabled: button.disabled,
    background: getComputedStyle(button).backgroundColor,
  }))
  assert.deepEqual(buttonState, {
    disabled: false,
    background: 'rgb(29, 29, 31)',
  })
  const storedLayout = await serviceWorker.evaluate(() => chrome.storage.local.get('floatLayout'))
  assert.equal(storedLayout.floatLayout, undefined)

  const apiOrigin = `http://127.0.0.1:${address.port}`
  await panelFrame.getByLabel('OmniMail 地址').fill(apiOrigin)
  await authorizeFromPanel(context, loginButton)
  await panelFrame.getByRole('heading', { name: '快速生成邮箱' }).waitFor()
  await panelFrame.getByRole('button', { name: '收件' }).click()
  await upgradeMailSourceAuthorization(context, panelFrame)
  await panelFrame.getByRole('button', { name: '生成', exact: true }).click()
  const randomMailboxButton = panelFrame.getByRole('button', { name: '随机生成邮箱' })
  await randomMailboxButton.click({ trial: true })
  assert.deepEqual(await randomMailboxButton.evaluate((button) => ({
    background: getComputedStyle(button).backgroundColor,
    disabled: button.disabled,
  })), { background: 'rgb(29, 29, 31)', disabled: false })
  assert.equal(await panelFrame.locator('select').count(), 0)
  const domainCombobox = panelFrame.getByRole('combobox', { name: '邮箱域名' })
  await domainCombobox.click()
  await panelFrame.getByRole('listbox', { name: '邮箱域名' }).waitFor()
  await page.screenshot({ path: dropdownScreenshotPath })
  await panelFrame.getByRole('option', { name: '@example.com' }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(220)
  await panelFrame.getByRole('combobox', { name: '邮箱域名' }).click()
  await panelFrame.getByRole('listbox', { name: '邮箱域名' }).waitFor()
  await page.screenshot({ path: darkDropdownScreenshotPath })
  await panelFrame.getByRole('option', { name: '@example.com' }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await domainCombobox.press('ArrowDown')
  await panelFrame.getByRole('listbox', { name: '邮箱域名' }).waitFor()
  await domainCombobox.press('ArrowDown')
  await domainCombobox.press('Enter')
  assert.equal(await domainCombobox.textContent(), '@aicnos.com')
  await domainCombobox.click()
  await panelFrame.getByRole('option', { name: '@example.com' }).click()
  assert.equal(exchangeBody.clientId, serviceWorker.url().split('/')[2])
  assert.match(exchangeBody.codeVerifier, /^[A-Za-z0-9_-]{43}$/)
  await mkdir(capturedAssetsPath, { recursive: true })
  await panelFrame.locator('.panel-main').evaluate((element) => element.scrollTo({ top: 0 }))
  await page.screenshot({
    path: resolve(capturedAssetsPath, '01-floating-generate.jpg'),
    type: 'jpeg', quality: 94,
  })

  await panelFrame.getByLabel('邮箱前缀 可选').fill('custom-box')
  await panelFrame.getByRole('button', { name: '创建自定义邮箱' }).click()
  await panelFrame.getByText('邮箱已生成').waitFor()
  assert.equal(mailboxes.at(-1).address, 'custom-box@example.com')
  await panelFrame.getByText('邮箱已生成').waitFor({ state: 'hidden' })

  await randomMailboxButton.click()
  await panelFrame.getByText('邮箱已生成').waitFor()
  const generatedAddress = mailboxes.at(-1).address
  assert.match(generatedAddress, /^alias-[a-f0-9]{12}@example\.com$/)
  const recentMail = panelFrame.getByRole('region', { name: '当前邮箱邮件' })
  await recentMail.getByText('Your verification code').waitFor()
  assert.equal(lastMessageMailbox, generatedAddress)
  await recentMail.getByText('每 5 秒自动刷新').waitFor()
  const requestsBeforeManualRefresh = messageListRequests
  const recentRefreshButton = recentMail.getByRole('button', { name: '立即刷新当前邮箱' })
  await recentRefreshButton.click()
  await recentRefreshButton.click({ trial: true })
  assert(messageListRequests > requestsBeforeManualRefresh)
  const requestsBeforeAutoRefresh = messageListRequests
  await page.waitForTimeout(5_200)
  assert(messageListRequests > requestsBeforeAutoRefresh)
  await panelFrame.getByRole('button', { name: '填入网页' }).click()
  await page.getByLabel('邮箱地址').waitFor()
  assert.equal(await page.getByLabel('邮箱地址').inputValue(), generatedAddress)
  await recentMail.getByText('Your verification code').click()
  await panelFrame.getByRole('heading', { name: 'Your verification code' }).waitFor()
  await panelFrame.getByRole('button', { name: '返回收件箱' }).click()

  await panelFrame.locator('.panel-nav').getByRole('button', { name: '生成', exact: true }).click()
  await selectMailSource(panelFrame, 'iCloud')
  await panelFrame.getByRole('combobox', { name: 'iCloud 账号' }).waitFor()
  const existingAliasSelect = panelFrame.getByRole('combobox', { name: '已有 iCloud 隐藏邮箱' })
  await existingAliasSelect.waitFor()
  await existingAliasSelect.getByText('existing-alias@icloud.com', { exact: false }).waitFor()
  const existingAliasCard = panelFrame.locator('.icloud-existing-card')
  const cardHeight = (await existingAliasCard.boundingBox()).height
  iCloudAliasGate = { started: deferred(), release: deferred() }
  await panelFrame.getByRole('button', { name: '刷新已有 iCloud 隐藏邮箱' }).click()
  await iCloudAliasGate.started.promise
  const aliasSkeleton = panelFrame.locator('.icloud-alias-skeleton')
  await aliasSkeleton.waitFor()
  const skeletonCardHeight = (await existingAliasCard.boundingBox()).height
  assert(Math.abs(skeletonCardHeight - cardHeight) < 1, `alias card shifted from ${cardHeight} to ${skeletonCardHeight}`)
  await page.screenshot({ path: resolve('test-results', 'extension-icloud-skeleton.png') })
  iCloudAliasGate.release.resolve()
  await aliasSkeleton.waitFor({ state: 'hidden' })
  iCloudAliasGate = null
  await panelFrame.getByRole('button', { name: '填入网页' }).click()
  assert.equal(await page.getByLabel('邮箱地址').inputValue(), 'existing-alias@icloud.com')
  await panelFrame.getByRole('button', { name: '创建新的隐藏邮箱' }).click()
  await panelFrame.getByLabel('用途标签 可选').fill('购物注册')
  await panelFrame.getByRole('button', { name: '生成 iCloud 隐藏邮箱' }).click()
  await existingAliasSelect.getByText('float-preview@icloud.com', { exact: false }).waitFor()
  assert.deepEqual(iCloudAliasBody, {
    accountId: 'icloud-account-1',
    label: '购物注册',
  })
  await page.waitForTimeout(300)
  const customScrollbar = panelFrame.locator('.panel-scrollbar')
  assert.match(await customScrollbar.getAttribute('class'), /has-overflow/)
  await panelFrame.locator('.panel-main').evaluate((element) => { element.scrollTop = 40 })
  assert.equal(await customScrollbar.evaluate((element) => getComputedStyle(element).opacity), '0')
  await customScrollbar.hover()
  await page.waitForTimeout(500)
  assert.equal(await customScrollbar.evaluate((element) => getComputedStyle(element).opacity), '0')
  await page.waitForTimeout(500)
  assert.equal(await customScrollbar.evaluate((element) => getComputedStyle(element).opacity), '1')
  await page.screenshot({ path: resolve('test-results', 'extension-scrollbar-visible.png') })
  await panelFrame.locator('.panel-nav').hover()
  await page.waitForTimeout(300)
  assert.equal(await customScrollbar.evaluate((element) => getComputedStyle(element).opacity), '0')
  await page.screenshot({ path: resolve('test-results', 'extension-icloud.png') })
  await page.screenshot({
    path: resolve(capturedAssetsPath, '04-floating-icloud-generate.jpg'),
    type: 'jpeg', quality: 94,
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(220)
  await page.screenshot({ path: resolve('test-results', 'extension-icloud-dark.png') })
  await page.emulateMedia({ colorScheme: 'light' })
  await panelFrame.getByRole('button', { name: '填入网页' }).click()
  assert.equal(await page.getByLabel('邮箱地址').inputValue(), 'float-preview@icloud.com')
  await selectMailSource(panelFrame, 'OmniMail')
  await panelFrame.getByRole('button', { name: '随机生成邮箱' }).waitFor()

  await panelFrame.getByRole('button', { name: '收件' }).click()
  await selectMailSource(panelFrame, 'iCloud')
  await panelFrame.getByRole('heading', { name: 'iCloud 收件' }).waitFor()
  await panelFrame.getByText('Your iCloud verification code').waitFor()
  assert.equal(lastICloudInboxAlias, 'float-preview@icloud.com')
  await panelFrame.getByText('Your iCloud verification code').click()
  await panelFrame.getByRole('heading', { name: 'Your iCloud verification code' }).waitFor()
  await panelFrame.frameLocator('iframe[title="iCloud 邮件正文"]').getByText('654321').waitFor()
  await page.screenshot({ path: resolve('test-results', 'extension-icloud-inbox.png') })
  await page.screenshot({
    path: resolve(capturedAssetsPath, '05-floating-icloud-inbox.jpg'),
    type: 'jpeg', quality: 94,
  })
  await panelFrame.getByRole('button', { name: '返回 iCloud 收件箱' }).click()
  await verifyIndexedSources(panelFrame, page)
  await verifyRemainingSources(panelFrame)
  await selectMailSource(panelFrame, 'OmniMail')
  await panelFrame.getByRole('combobox', { name: '筛选邮箱' }).click()
  await panelFrame.getByRole('listbox', { name: '筛选邮箱' }).waitFor()
  await panelFrame.getByRole('option', { name: '全部邮箱' }).click()
  await panelFrame.getByText('Your verification code').waitFor()
  await page.screenshot({
    path: resolve(capturedAssetsPath, '02-floating-inbox.jpg'),
    type: 'jpeg', quality: 94,
  })

  messageGate = {
    mailbox: 'custom-box@example.com',
    started: deferred(),
    release: deferred(),
    completed: deferred(),
  }
  await panelFrame.getByRole('combobox', { name: '筛选邮箱' }).click()
  await panelFrame.getByRole('option', { name: 'custom-box@example.com' }).click()
  await messageGate.started.promise
  await panelFrame.getByRole('combobox', { name: '筛选邮箱' }).click()
  await panelFrame.getByRole('option', { name: 'inbox@example.com' }).click()
  await panelFrame.getByText('Mail for inbox@example.com').waitFor()
  messageGate.release.resolve()
  await messageGate.completed.promise
  await page.waitForTimeout(100)
  assert.equal(await panelFrame.getByText('Mail for inbox@example.com').count(), 1)
  assert.equal(await panelFrame.getByText('Mail for custom-box@example.com').count(), 0)
  messageGate = null
  await panelFrame.getByRole('combobox', { name: '筛选邮箱' }).click()
  await panelFrame.getByRole('option', { name: '全部邮箱' }).click()
  await panelFrame.getByText('Your verification code').waitFor()

  await panelFrame.getByText('Your verification code').click()
  await panelFrame.getByRole('heading', { name: 'Your verification code' }).waitFor()
  await panelFrame.frameLocator('iframe[title="邮件正文"]').getByText('123456').waitFor()
  await page.screenshot({
    path: resolve(capturedAssetsPath, '03-floating-message.jpg'),
    type: 'jpeg', quality: 94,
  })
  await selectAndRememberSource(panelFrame, serviceWorker)
  await verifyThemeSwitch(page, panelFrame, serviceWorker)

  const dockNodes = (await cdp.send('DOM.getFlattenedDocument', { depth: -1, pierce: true })).nodes
  const floatHeader = nodeWithClass(dockNodes, 'omnimail-float-header')
  assert(floatHeader?.nodeId, 'floating panel header was not found')
  const headerBox = await cdp.send('DOM.getBoxModel', { nodeId: floatHeader.nodeId })
  const [headerX1, headerY1, headerX2, , , headerY3] = headerBox.model.content
  const headerX = (headerX1 + headerX2) / 2
  const headerY = (headerY1 + headerY3) / 2
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: headerX, y: headerY, button: 'left', buttons: 1, clickCount: 1,
  })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: 1277, y: headerY, button: 'left', buttons: 1,
  })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: 1277, y: headerY, button: 'left', buttons: 0, clickCount: 1,
  })
  await page.waitForTimeout(250)

  const collapsedNodes = (await cdp.send('DOM.getFlattenedDocument', { depth: -1, pierce: true })).nodes
  const collapsedButton = nodeWithClass(collapsedNodes, 'omnimail-float-button')
  const collapsedPanel = nodeWithClass(collapsedNodes, 'omnimail-float-panel')
  assert(collapsedButton?.nodeId && collapsedPanel?.nodeId, 'docked controls were not found')
  assert.match(nodeAttribute(collapsedButton, 'class'), /\bis-docked\b/)
  assert.equal(nodeAttribute(collapsedButton, 'aria-expanded'), 'false')
  assert.doesNotMatch(nodeAttribute(collapsedPanel, 'class'), /\bis-visible\b/)
  const collapsedBox = await cdp.send('DOM.getBoxModel', { nodeId: collapsedButton.nodeId })
  const [dockX1, , dockX2] = collapsedBox.model.border
  assert.equal(Math.round(dockX2 - dockX1), 44)
  assert.equal(Math.round(dockX2), 1280)
  const dockedStorage = await serviceWorker.evaluate(() => chrome.storage.local.get('floatLayout'))
  assert.equal(dockedStorage.floatLayout.docked, true)
  assert(dockedStorage.floatLayout.panel.width >= 360)
  await page.screenshot({ path: resolve('test-results', 'extension-docked.png') })

  await page.reload()
  await page.waitForTimeout(500)
  const restoredNodes = (await cdp.send('DOM.getFlattenedDocument', { depth: -1, pierce: true })).nodes
  const restoredButton = nodeWithClass(restoredNodes, 'omnimail-float-button')
  assert(restoredButton?.nodeId, 'restored docked button was not found')
  assert.match(nodeAttribute(restoredButton, 'class'), /\bis-docked\b/)
  const restoredBox = await cdp.send('DOM.getBoxModel', { nodeId: restoredButton.nodeId })
  const [restoreX1, restoreY1, , , restoreX3, restoreY3] = restoredBox.model.content
  const restoredFramePromise = page.waitForEvent('framenavigated', {
    predicate: (candidate) => candidate !== page.mainFrame() && candidate.url().endsWith('/panel.html'),
    timeout: 10_000,
  })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: (restoreX1 + restoreX3) / 2, y: (restoreY1 + restoreY3) / 2,
    button: 'left', buttons: 1, clickCount: 1,
  })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: (restoreX1 + restoreX3) / 2, y: (restoreY1 + restoreY3) / 2,
    button: 'left', buttons: 0, clickCount: 1,
  })
  const restoredFrame = await restoredFramePromise
  await restoredFrame.getByRole('heading', { name: '快速生成邮箱' }).waitFor()
  await verifyThemeRestored(page, restoredFrame)
  await restoredFrame.locator('.panel-nav').getByRole('button', { name: '收件', exact: true }).click()
  await restoredFrame.getByRole('heading', { name: 'Gmail 收件箱' }).waitFor()
  const transitionState = await restoredFrame.locator('.panel-view').evaluate((element) => ({
    duration: getComputedStyle(element).animationDuration,
    name: getComputedStyle(element).animationName,
  }))
  assert.deepEqual(transitionState, { duration: '0.18s', name: 'panel-view-in' })
  await restoredFrame.locator('.panel-nav').getByRole('button', { name: '生成', exact: true }).click()
  await page.waitForTimeout(220)
  const expandedNodes = (await cdp.send('DOM.getFlattenedDocument', { depth: -1, pierce: true })).nodes
  assert.match(nodeAttribute(nodeWithClass(expandedNodes, 'omnimail-float-panel'), 'class'), /\bis-visible\b/)
  await page.screenshot({ path: resolve('test-results', 'extension-docked-expanded.png') })

  if (!previewMode) {
    await restoredFrame.locator('.panel-nav').getByRole('button', { name: '设置', exact: true }).click()
    await restoredFrame.getByRole('button', { name: /跟随系统/ }).click()
    assert.equal((await serviceWorker.evaluate(() => chrome.storage.local.get('theme'))).theme, 'system')
    await serviceWorker.evaluate(() => chrome.storage.session.clear())
    const restoredAuth = await restoredFrame.evaluate(() => new Promise((resolveResponse) => {
      chrome.runtime.sendMessage({ type: 'auth:status' }, resolveResponse)
    }))
    assert.equal(restoredAuth.authenticated, true)
    assert.equal(restoredAuth.iCloudAuthorized, true)
    assert.equal(restoredAuth.mailSourcesAuthorized, true)
    assert.equal(restoredAuth.user.email, user.email)
    const restoredMessages = await restoredFrame.evaluate(() => new Promise((resolveResponse) => {
      chrome.runtime.sendMessage({ type: 'api:messages' }, resolveResponse)
    }))
    assert.equal(restoredMessages.messages[0].id, message.id)

    refreshResponseStatus = 500
    await serviceWorker.evaluate(() => chrome.storage.session.set({ accessExpiresAt: 0 }))
    const transientRefresh = await restoredFrame.evaluate(() => new Promise((resolveResponse) => {
      chrome.runtime.sendMessage({ type: 'api:messages' }, resolveResponse)
    }))
    assert.equal(transientRefresh.error, 'Refresh failed (500)')
    const preservedAuth = await restoredFrame.evaluate(() => new Promise((resolveResponse) => {
      chrome.runtime.sendMessage({ type: 'auth:status' }, resolveResponse)
    }))
    assert.equal(preservedAuth.authenticated, true)

    refreshResponseStatus = 401
    const rejectedRefresh = await restoredFrame.evaluate(() => new Promise((resolveResponse) => {
      chrome.runtime.sendMessage({ type: 'api:messages' }, resolveResponse)
    }))
    assert.equal(rejectedRefresh.error, 'Refresh failed (401)')
    const clearedAuth = await restoredFrame.evaluate(() => new Promise((resolveResponse) => {
      chrome.runtime.sendMessage({ type: 'auth:status' }, resolveResponse)
    }))
    assert.equal(clearedAuth.authenticated, false)
  }

  if (previewMode) {
    await restoredFrame.locator('.panel-nav').getByRole('button', { name: '设置', exact: true }).click()
    await restoredFrame.getByRole('button', { name: /^暗色/ }).waitFor()
    await restoredFrame.locator('.panel-main').evaluate((element) => element.scrollTo({ top: 0 }))
    await page.waitForTimeout(220)
    await page.screenshot({ path: resolve('test-results', 'extension-docked-expanded-dark.png') })
    await page.bringToFront()
    console.log('Float theme preview is ready. Try System, Light, and Dark in Settings.')
    await new Promise(() => {})
  }
  await createPromoAsset(context, capturedAssetsPath)
  await page.screenshot({ path: screenshotPath })
  console.log(`Extension smoke test passed: ${screenshotPath}`)
} finally {
  await context?.close()
  await new Promise((resolveClose) => server.close(resolveClose))
  await rm(profilePath, { recursive: true, force: true })
}
