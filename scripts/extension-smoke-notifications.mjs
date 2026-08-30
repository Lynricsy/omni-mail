import { strict as assert } from 'node:assert'

export async function verifyNotificationSettings(page, frame, serviceWorker, addGmailNotification) {
  const notifications = frame.getByRole('checkbox', { name: '新邮件通知' })
  await notifications.uncheck()
  await page.waitForTimeout(100)
  assert.equal((await serviceWorker.evaluate(() => (
    chrome.storage.local.get('notificationsEnabled')
  ))).notificationsEnabled, false)
  await notifications.check()
  const gmailNotifications = frame.getByRole('checkbox', { name: 'Gmail' })
  await gmailNotifications.uncheck()
  await page.waitForTimeout(100)
  assert.equal((await serviceWorker.evaluate(() => (
    chrome.storage.local.get('notificationSources')
  ))).notificationSources.includes('gmail'), false)
  await gmailNotifications.check()
  await frame.getByLabel('开始').fill('22:00')
  await frame.getByLabel('结束').fill('07:00')
  await page.waitForTimeout(100)
  const quietHours = await serviceWorker.evaluate(() => chrome.storage.local.get([
    'quietHoursStart', 'quietHoursEnd',
  ]))
  assert.deepEqual(quietHours, { quietHoursStart: '22:00', quietHoursEnd: '07:00' })
  await serviceWorker.evaluate(async () => {
    await chrome.storage.local.set({ quietHoursStart: '', quietHoursEnd: '' })
    await chrome.storage.local.remove(['knownMessageKeys', 'knownNotificationSources'])
    await chrome.alarms.create('omnimail-mail-poll', { when: Date.now() + 100 })
  })
  await page.waitForTimeout(1_500)
  assert.equal(Object.keys(await serviceWorker.evaluate(() => chrome.notifications.getAll())).length, 0)
  addGmailNotification()
  await serviceWorker.evaluate(() => chrome.alarms.create(
    'omnimail-mail-poll', { when: Date.now() + 100 },
  ))
  await page.waitForTimeout(1_500)
  const notificationIds = Object.keys(await serviceWorker.evaluate(() => chrome.notifications.getAll()))
  assert.equal(notificationIds.length, 1)
  assert.match(notificationIds[0], /^float:/)
  const targets = await serviceWorker.evaluate(() => chrome.storage.local.get('notificationTargets'))
  assert.match(targets.notificationTargets[notificationIds[0]], /^\/gmail\?/)
}
