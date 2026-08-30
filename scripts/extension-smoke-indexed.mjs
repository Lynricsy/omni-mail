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
let indexedAccountRequests = 0

function summary(source, account) {
  return {
    id: `${source}-message-1`, account, senderName: `${source.toUpperCase()} Test`,
    senderAddress: `sender@${source}.example`, recipients: [account.email], cc: [],
    subject: `Your ${source.toUpperCase()} verification code`, preview: 'Code 246810',
    date: Date.now(), sizeBytes: 1024, isRead: false, isStarred: false,
    hasAttachments: false,
  }
}

function detail(source, account) {
  return {
    ...summary(source, account), from: `${source.toUpperCase()} Test <sender@${source}.example>`,
    to: account.email, cc: '', date: new Date().toISOString(), body: `Your code is 246810.`,
    html: `<p>Your ${source.toUpperCase()} code is <strong>246810</strong>.</p>`, attachments: [],
  }
}

export function handleIndexedRequest(url, response) {
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
    json(response, { enabled: true, accounts: [account] })
    return true
  }
  if (url.pathname === `${root}/messages`) {
    json(response, {
      messages: [summary(source, account)],
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    return true
  }
  if (url.pathname === `${root}/accounts/${account.id}/messages/${source}-message-1`) {
    json(response, { message: detail(source, account) })
    return true
  }
  return false
}

export async function selectMailSource(frame, label) {
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
  const source = frame.getByRole('combobox', { name: '邮箱来源' })
  await source.press('ArrowDown')
  await frame.getByRole('listbox', { name: '邮箱来源' }).waitFor()
  await source.press('End')
  assert.match(
    await frame.getByRole('option', { name: 'Linux DO Mail', exact: true }).getAttribute('class'),
    /is-active/,
  )
  await source.press('Enter')
  await frame.getByRole('heading', { name: 'Linux DO Mail 收件箱' }).waitFor()
  await selectMailSource(frame, 'Gmail')
  await frame.getByRole('heading', { name: 'Gmail 收件箱' }).waitFor()
  await page.screenshot({ path: 'test-results/extension-gmail-inbox.png' })
  await frame.getByText('Your GMAIL verification code').click()
  await frame.getByRole('heading', { name: 'Your GMAIL verification code' }).waitFor()
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
}

export async function verifyMoreIndexedSources(frame) {
  await verifySource(frame, 'Microsoft', 'Microsoft 收件箱', 'MICROSOFT')
  await verifySource(frame, 'NAVER', 'NAVER 收件箱', 'NAVER')
  await verifySource(frame, 'Yandex', 'Yandex 收件箱', 'YANDEX')
}

export async function verifyLinuxDoSource(frame) {
  await selectMailSource(frame, 'Linux DO Mail')
  await frame.getByRole('heading', { name: 'Linux DO Mail 收件箱' }).waitFor()
  await frame.getByText('Linux DO inbox verification code').click()
  await frame.frameLocator('iframe[title="Linux DO Mail 邮件正文"]').getByText('246810').waitFor()
  await frame.getByRole('button', { name: '返回 Linux DO Mail 收件箱' }).click()
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
