import { strict as assert } from 'node:assert'
import { json } from './extension-smoke-fixtures.mjs'

const sources = [
  { id: 'gmail', root: 'gmail', label: 'Gmail', email: 'owner@gmail.com', status: 'active' },
  { id: 'microsoft', root: 'microsoft', label: 'Microsoft', email: 'owner@outlook.com', status: 'active' },
  { id: 'qq', root: 'qq-mail', label: 'QQ', email: '1915992742@qq.com', status: 'credential_error' },
  { id: 'naver', root: 'naver-mail', label: 'NAVER', email: 'owner@naver.com', status: 'active' },
  { id: 'yandex', root: 'yandex-mail', label: 'Yandex', email: 'owner@yandex.com', status: 'active' },
].map((source) => ({ ...source, account: {
  id: `${source.id}-account-1`, name: `Personal ${source.label}`,
  email: source.email, status: source.status,
} }))
const linuxDoAccount = {
  id: 'linuxdo-account-1', username: 'owner@linux.do', status: 'active',
}
const activeQqAccount = {
  id: 'qq-account-2', name: 'Send QQ', email: 'sender@qq.com', status: 'active',
  identities: [{ id: 'qq-identity-2', accountId: 'qq-account-2', name: 'Sender',
    email: 'sender@qq.com', isPrimary: true, createdAt: 1, updatedAt: 1 }],
}
let indexedAccountRequests = 0
let gmailNotificationRevision = 0

export function addGmailNotification() {
  gmailNotificationRevision += 1
}

function summary(source, account) {
  return {
    id: `${source}-message-1`, account, senderName: `${source.toUpperCase()} Test`,
    senderAddress: `sender@${source}.example`, recipients: [account.email], cc: [],
    subject: `Your ${source.toUpperCase()} verification code`, preview: 'Code 246810',
    date: Date.now(), sizeBytes: 1024, isRead: false, isStarred: false,
    hasAttachments: source === 'gmail',
  }
}

function detail(source, account) {
  return {
    ...summary(source, account), from: `${source.toUpperCase()} Test <sender@${source}.example>`,
    to: account.email, cc: '', date: new Date().toISOString(), body: `Your code is 246810.`,
    html: `<p>Your ${source.toUpperCase()} code is <strong>246810</strong>.</p>`,
    attachments: source === 'gmail' ? [{
      partId: '0', filename: 'verification.txt', contentType: 'text/plain',
      size: 24, contentId: null, disposition: 'attachment',
    }] : [],
  }
}

export function handleIndexedRequest(url, request, response) {
  if (url.pathname === '/api/mail-notifications') {
    const enabled = new Set((url.searchParams.get('sources') || '').split(','))
    const messages = sources.flatMap(({ id, account }) => (
      enabled.has(id) ? [{
        source: id, accountId: account.id, messageId: `${id}-message-1`,
        senderName: `${id.toUpperCase()} Test`, senderAddress: `sender@${id}.example`,
        subject: `Your ${id.toUpperCase()} verification code`, date: Date.now(), isRead: false,
      }] : []
    ))
    if (enabled.has('omnimail')) messages.push({
      source: 'omnimail', accountId: '', messageId: 'message-1',
      senderName: 'OmniMail Test', senderAddress: 'sender@example.net',
      subject: 'Your verification code', date: Date.now(), isRead: false,
    })
    if (enabled.has('linuxdo')) messages.push({
      source: 'linuxdo', accountId: linuxDoAccount.id, messageId: '42',
      senderName: 'Linux DO Test', senderAddress: 'sender@example.net',
      subject: 'Linux DO inbox verification code', date: Date.now(), isRead: false,
    })
    if (enabled.has('gmail') && gmailNotificationRevision) messages.push({
      source: 'gmail', accountId: 'gmail-account-1',
      messageId: `gmail-notification-${gmailNotificationRevision}`,
      senderName: 'GMAIL Test', senderAddress: 'sender@gmail.example',
      subject: 'New Gmail notification message', date: Date.now() + 1, isRead: false,
    })
    const available = ['omnimail', 'linuxdo', ...sources.map(({ id }) => id)]
      .filter((source) => enabled.has(source))
    json(response, { messages, sources: available, unread: messages.length })
    return true
  }
  if (url.pathname === '/api/linux-do-mail/account') {
    indexedAccountRequests += 1
    json(response, { enabled: true, account: linuxDoAccount })
    return true
  }
  if (url.pathname === '/api/linux-do-mail/inbox' || url.pathname === '/api/linux-do-mail/sent') {
    const sent = url.pathname.endsWith('/sent')
    json(response, { messages: [{
      id: sent ? 'linuxdo-sent-1' : '42',
      from: sent ? linuxDoAccount.username : 'Linux DO Test <sender@example.net>',
      to: sent ? 'recipient@example.net' : linuxDoAccount.username,
      subject: `Linux DO ${sent ? 'sent' : 'inbox'} verification code`,
      date: new Date().toISOString(), preview: 'Code 246810', body: '', html: '',
      isRead: sent, direction: sent ? 'outgoing' : 'incoming',
    }] })
    return true
  }
  if (/^\/api\/linux-do-mail\/(?:inbox|sent)\/(?:42|linuxdo-sent-1)$/.test(url.pathname)) {
    const sent = url.pathname.includes('/sent/')
    json(response, { message: {
      id: sent ? 'linuxdo-sent-1' : '42',
      from: sent ? linuxDoAccount.username : 'Linux DO Test <sender@example.net>',
      to: sent ? 'recipient@example.net' : linuxDoAccount.username,
      subject: `Linux DO ${sent ? 'sent' : 'inbox'} verification code`,
      date: new Date().toISOString(), preview: 'Code 246810', body: 'Your code is 246810.',
      html: '<p>Your Linux DO code is <strong>246810</strong>.</p>',
      isRead: sent, direction: sent ? 'outgoing' : 'incoming',
    } })
    return true
  }
  const fixture = sources.find(({ root }) => url.pathname.startsWith(`/api/${root}/`))
  if (!fixture) return false
  const { id: source, account } = fixture
  const root = `/api/${fixture.root}`
  if (url.pathname === `${root}/accounts`) {
    indexedAccountRequests += 1
    json(response, { enabled: true, accounts: source === 'qq'
      ? [account, activeQqAccount] : [account] })
    return true
  }
  if (source === 'microsoft'
    && url.pathname === `${root}/accounts/${account.id}/folders`) {
    json(response, { folders: [
      { path: 'INBOX', displayName: 'Inbox', flags: [], specialUse: '\\Inbox', uidValidity: 1, lastUid: 1 },
      { path: 'Archive', displayName: 'Archive', flags: [], specialUse: '', uidValidity: 1, lastUid: 1 },
    ] })
    return true
  }
  if (url.pathname.startsWith(`${root}/accounts/`) && url.pathname.endsWith('/sync')
    && request.method === 'POST') {
    json(response, { queued: true }, 202)
    return true
  }
  if (source === 'qq'
    && url.pathname === `${root}/accounts/${activeQqAccount.id}/messages`
    && request.method === 'POST') {
    json(response, { message: { id: 'qq-outgoing-1', status: 'processing' } }, 202)
    return true
  }
  if (url.pathname === `${root}/messages`) {
    const nextPage = source === 'gmail' && url.searchParams.get('cursor') === 'gmail-next'
    json(response, {
      messages: [nextPage ? {
        ...summary(source, account), id: 'gmail-message-2',
        subject: 'Older GMAIL verification code', date: Date.now() - 60_000,
      } : summary(source, account), ...(source === 'gmail' && gmailNotificationRevision
        && !nextPage ? [{
          ...summary(source, account), id: `gmail-notification-${gmailNotificationRevision}`,
          subject: 'New Gmail notification message', date: Date.now() + gmailNotificationRevision,
        }] : [])],
      page: {
        hasMore: source === 'gmail' && !nextPage,
        nextCursor: source === 'gmail' && !nextPage ? 'gmail-next' : null,
        limit: 30,
      },
    })
    return true
  }
  if (url.pathname === `${root}/accounts/${account.id}/messages/${source}-message-1`) {
    json(response, { message: detail(source, account) })
    return true
  }
  if (source === 'gmail'
    && url.pathname === `${root}/accounts/${account.id}/messages/gmail-message-1/attachments/0`) {
    const content = Buffer.from('Attachment code: 246810')
    response.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Length': String(content.byteLength),
      'Content-Disposition': 'attachment; filename="verification.txt"',
    })
    response.end(content)
    return true
  }
  return false
}

export async function selectMailSource(frame, label) {
  await frame.getByRole('button', { name: `切换到 ${label} 收件箱` }).click()
}

export async function selectGenerateMailSource(frame, label) {
  const selector = frame.getByRole('combobox', { name: '邮箱来源' })
  await selector.click()
  await frame.getByRole('option', { name: label, exact: true }).click()
}

export async function authorizeFromPanel(context, trigger) {
  const authorizationPagePromise = context.waitForEvent('page', {
    predicate: (candidate) => candidate.url().includes('/extension/authorize'),
    timeout: 10_000,
  })
  await trigger.click()
  const page = await authorizationPagePromise
  await page.getByRole('heading', { name: '授权浏览器扩展' }).waitFor()
  await page.getByRole('button', { name: '允许访问' }).click()
}

export async function upgradeMailSourceAuthorization(context, frame) {
  const button = frame.getByRole('button', { name: '升级授权' })
  await button.waitFor()
  assert.equal(indexedAccountRequests, 5)
  await authorizeFromPanel(context, button)
  await button.waitFor({ state: 'hidden' })
  assert.equal(indexedAccountRequests, 11)
}

async function verifySource(frame, label, heading, code) {
  await selectMailSource(frame, label)
  await frame.getByRole('heading', { name: heading }).waitFor()
  await frame.getByText(`Your ${code} verification code`).click()
  await frame.getByRole('heading', { name: `Your ${code} verification code` }).waitFor()
  await frame.frameLocator(`iframe[title="${label} 邮件正文"]`).getByText('246810').waitFor()
  await frame.getByRole('button', { name: `返回 ${heading}` }).click()
}

export async function verifyIndexedSources(frame, page) {
  assert.equal(await frame.getByRole('combobox', { name: '邮箱来源' }).count(), 0)
  const sourceNavigation = frame.getByRole('navigation', { name: '邮箱来源导航' })
  assert.equal(await sourceNavigation.evaluate((element) => (
    getComputedStyle(element).scrollbarWidth
  )), 'none')
  const firstSource = frame.getByRole('button', { name: '切换到 OmniMail 收件箱' })
  await firstSource.focus()
  await firstSource.press('End')
  const focusedLabel = await frame.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  assert.equal(focusedLabel, '切换到 Linux DO Mail 收件箱')
  await frame.getByRole('button', { name: '切换到 Linux DO Mail 收件箱' }).press('Enter')
  await frame.getByRole('heading', { name: 'Linux DO Mail 收件箱' }).waitFor()
  await selectMailSource(frame, 'Gmail')
  await frame.getByRole('heading', { name: 'Gmail 收件箱' }).waitFor()
  await frame.getByRole('button', { name: '加载更多' }).click()
  await frame.getByText('Older GMAIL verification code').waitFor()
  const gmailAccount = frame.getByRole('combobox', { name: 'Gmail 账号' })
  await gmailAccount.click()
  await frame.getByRole('option', { name: /Personal Gmail/ }).click()
  await frame.getByRole('button', { name: '同步 Gmail 账号' }).click()
  await frame.getByText('同步任务已加入队列').waitFor()
  await page.screenshot({ path: 'test-results/extension-gmail-inbox.png' })
  await frame.getByText('Your GMAIL verification code').click()
  await frame.getByRole('heading', { name: 'Your GMAIL verification code' }).waitFor()
  await frame.getByRole('button', { name: '预览' }).click()
  await frame.getByText('Attachment code: 246810').waitFor()
  await frame.frameLocator('iframe[title="Gmail 邮件正文"]').getByText('246810').waitFor()
  await frame.getByRole('button', { name: '返回 Gmail 收件箱' }).click()

  await selectMailSource(frame, 'QQ 邮箱')
  await frame.getByRole('heading', { name: 'QQ 邮箱收件箱' }).waitFor()
  await frame.getByText('1 个账号需要修复；已索引邮件仍可查看。').waitFor()
  const account = frame.getByRole('combobox', { name: 'QQ 邮箱 账号' })
  await account.click()
  await frame.getByRole('option', { name: /Personal QQ.*需要修复/ }).click()
  await frame.getByPlaceholder('搜索主题、发件人或收件人').fill('verification')
  await frame.getByText('Your QQ verification code').waitFor()
  assert.match(await account.textContent(), /1915992742@qq\.com/)
  await page.screenshot({ path: 'test-results/extension-qq-inbox.png' })
  await account.click()
  await frame.getByRole('option', { name: /Send QQ/ }).click()
  await frame.getByRole('button', { name: '新建 QQ 邮件' }).click()
  await frame.getByLabel('收件邮箱').fill('recipient@example.com')
  await frame.getByLabel('主题').fill('Float QQ compose')
  await frame.getByLabel('正文').fill('Queued from Float.')
  await frame.getByRole('button', { name: '发送邮件' }).click()
  await frame.getByText('邮件已加入发送队列').waitFor()
}

export async function verifyMoreIndexedSources(frame) {
  await selectMailSource(frame, 'Microsoft')
  await frame.getByRole('heading', { name: 'Microsoft 收件箱' }).waitFor()
  const account = frame.getByRole('combobox', { name: 'Microsoft 账号' })
  await account.click()
  await frame.getByRole('option', { name: /Personal Microsoft/ }).click()
  const folder = frame.getByRole('combobox', { name: 'Microsoft 文件夹' })
  await folder.click()
  await frame.getByRole('option', { name: 'Archive' }).click()
  await frame.getByRole('heading', { name: 'Microsoft · Archive' }).waitFor()
  await frame.getByText('Your MICROSOFT verification code').click()
  await frame.getByRole('heading', { name: 'Your MICROSOFT verification code' }).waitFor()
  await frame.getByRole('button', { name: '返回 Microsoft · Archive' }).click()
  await verifySource(frame, 'NAVER', 'NAVER 收件箱', 'NAVER')
  await verifySource(frame, 'Yandex', 'Yandex 收件箱', 'YANDEX')
}

export async function verifyLinuxDoSource(frame) {
  await selectMailSource(frame, 'Linux DO Mail')
  await frame.getByRole('heading', { name: 'Linux DO Mail 收件箱' }).waitFor()
  await frame.getByText('Linux DO inbox verification code').click()
  await frame.frameLocator('iframe[title="Linux DO Mail 邮件正文"]').getByText('246810').waitFor()
  await frame.getByRole('button', { name: '返回 Linux DO Mail 收件箱' }).click()
  await frame.getByRole('button', { name: '新建 Linux DO Mail 邮件' }).click()
  await frame.getByLabel('收件邮箱').fill('recipient@example.com')
  await frame.getByLabel('主题').fill('Float Linux DO compose')
  await frame.getByLabel('正文').fill('Queued from Float.')
  await frame.getByRole('button', { name: '发送邮件' }).click()
  await frame.getByText('邮件已加入发送队列').waitFor()
  const folder = frame.getByRole('combobox', { name: 'Linux DO Mail 文件夹' })
  await folder.click()
  await frame.getByRole('option', { name: '已发送' }).click()
  await frame.getByRole('heading', { name: 'Linux DO Mail 已发送' }).waitFor()
  await frame.getByText('Linux DO sent verification code').waitFor()
}

export async function verifyRemainingSources(frame) {
  await verifyMoreIndexedSources(frame)
  await verifyLinuxDoSource(frame)
}

export async function selectAndRememberSource(frame, serviceWorker) {
  await selectMailSource(frame, 'Gmail')
  const saved = await serviceWorker.evaluate(() => chrome.storage.local.get('lastInboxSource'))
  assert.equal(saved.lastInboxSource, 'gmail')
}
