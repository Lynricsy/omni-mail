import { expect, type Route, test } from '@playwright/test'
import { message, user } from './omnimail-fixtures'

function json(route: Route, body: unknown) {
  return route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

test('slow remote images do not block readable email content', async ({ page }) => {
  const subject = 'Time to RSVP: Apple Invites is ready to download.'
  let proxiedImageSource = ''
  let releaseRemoteImage!: () => void
  const remoteImageGate = new Promise<void>((resolve) => {
    releaseRemoteImage = resolve
  })

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config') return json(route, {
      appName: 'OmniMail', setupComplete: true, replyEnabled: false,
      registrationEnabled: false, registrationAvailable: false,
      registrationMethod: 'password', linuxDoLoginEnabled: false,
      registrationDomainPolicy: { mode: 'blocklist', domains: [] },
      registrationProtectionReady: false, turnstileSiteKey: '',
      mailRefreshInterval: 30, remoteImagesEnabled: true,
      unassignedMailEnabled: false, superAdminEmail: user.email,
      setupRequirements: {
        databaseReady: true, storageReady: true, queueReady: true,
        superAdminReady: true, setupTokenReady: false,
      },
    })
    if (path === '/api/session') return json(route, { user })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [{
      address: 'inbox@example.com', domain: 'example.com',
      isPrimary: true, isActive: true,
    }] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/drafts') return json(route, { drafts: [], limit: 5 })
    if (path === '/api/messages/message-1') return json(route, {
      message: {
        ...message, messageId: null, inReplyTo: null, references: null,
        subject,
        cc: [], text: 'Readable before the image',
        html: `
          <style>
            @media (prefers-color-scheme: dark) {
              .content { color: white !important; }
            }
          </style>
          <div class="content" style="background:#fff">
            Readable before the image
            <img src="http://assets.vodafone.co.uk/slow.gif" alt="Slow image">
          </div>`,
        attachments: [],
      },
      thread: [message],
    })
    if (path === '/api/messages') return json(route, {
      unchanged: false, version: 1, messages: [message],
      counts: { unread: 0, starred: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    if (path === '/api/remote-images') {
      proxiedImageSource = new URL(request.url()).searchParams.get('url') ?? ''
      await remoteImageGate
      return route.fulfill({
        contentType: 'image/gif',
        body: Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64'),
      })
    }
    return route.fulfill({ status: 500, body: `Unhandled route: ${path}` })
  })

  try {
    await page.goto('/')
    await page.getByText('Welcome to OmniMail').click()
    const content = page.frameLocator('iframe').locator('.content')
    await expect(content).toBeVisible()
    await expect(content).toHaveCSS('color', 'rgb(34, 34, 34)')
    await expect(content).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    const reader = page.locator('.reader-content')
    await expect(reader).not.toHaveClass(/is-scrollbar-active/)
    await reader.hover()
    await page.mouse.wheel(0, 120)
    await expect(reader).toHaveClass(/is-scrollbar-active/)
    await expect(reader).not.toHaveClass(/is-scrollbar-active/, { timeout: 2_000 })
    const toolbarTypewriter = page.locator('.reader-toolbar__typewriter')
    await reader.evaluate((element) => { element.scrollTop = 0 })
    await expect(toolbarTypewriter).toHaveText('邮件详情')
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' })
    await reader.evaluate((element) => { element.scrollTop = element.scrollHeight })
    const toolbarSubject = page.getByRole('button', { name: `回到顶部：${subject}` })
    const scrollTopButton = page.locator('.reader-scroll-top')
    await expect(toolbarSubject).toBeVisible()
    await expect(toolbarTypewriter).toHaveClass(/is-typing/)
    await expect(toolbarTypewriter).toHaveText(subject)
    await expect(toolbarTypewriter).not.toHaveClass(/is-typing/)
    await expect(scrollTopButton).toHaveClass(/is-visible/)
    await toolbarSubject.click()
    await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBe(0)
    await expect(toolbarSubject).toHaveCount(0)
    await expect(toolbarTypewriter).toHaveClass(/is-typing/)
    await expect(toolbarTypewriter).toHaveText('邮件详情')
    await expect(toolbarTypewriter).not.toHaveClass(/is-typing/)
    await reader.evaluate((element) => { element.scrollTop = element.scrollHeight })
    await expect(toolbarTypewriter).toHaveClass(/is-typing/)
    await reader.evaluate((element) => { element.scrollTop = 0 })
    await expect(toolbarSubject).toHaveCount(0)
    await expect(toolbarTypewriter).toHaveText('邮件详情')
    await expect(toolbarTypewriter).not.toHaveClass(/is-typing/)
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await reader.evaluate((element) => { element.scrollTop = element.scrollHeight })
    await expect(toolbarTypewriter).toHaveText(subject)
    await expect(toolbarTypewriter).not.toHaveClass(/is-typing/)
    await expect(scrollTopButton).toHaveClass(/is-visible/)
    await scrollTopButton.click()
    await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBe(0)
    await expect(toolbarTypewriter).toHaveText('邮件详情')
    for (const viewport of [{ width: 375, height: 900 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport)
      await reader.evaluate((element) => { element.scrollTop = element.scrollHeight })
      await expect(toolbarSubject).toBeVisible()
      await expect(scrollTopButton).toBeVisible()
      const buttonBox = await scrollTopButton.boundingBox()
      expect(buttonBox).not.toBeNull()
      expect((buttonBox?.x ?? 0) + (buttonBox?.width ?? 0) <= viewport.width).toBe(true)
      expect((buttonBox?.y ?? 0) + (buttonBox?.height ?? 0) <= viewport.height).toBe(true)
      if (viewport.width === 375) {
        expect(await toolbarTypewriter.evaluate((element) => (
          element.scrollWidth > element.clientWidth
        ))).toBe(true)
      }
      expect(await page.evaluate(() => (
        document.documentElement.scrollWidth <= document.documentElement.clientWidth
      ))).toBe(true)
      await scrollTopButton.click()
      await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBe(0)
    }
    await expect.poll(() => proxiedImageSource).toBe(
      'https://assets.vodafone.co.uk/slow.gif',
    )
    releaseRemoteImage()
    await expect.poll(() => content.locator('img').evaluate((image) => (
      (image as HTMLImageElement).naturalWidth
    ))).toBe(1)
  } finally {
    releaseRemoteImage()
  }
})

test('translates a message and switches back to the original', async ({ page }) => {
  let requestedTarget = ''
  await page.addInitScript(() => {
    localStorage.setItem('omnimail.deployment-guide.v1', 'seen')
    localStorage.setItem('omnimail-locale', 'zh-CN')
  })
  await page.route('**://*/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config') return json(route, {
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
    })
    if (path === '/api/session') return json(route, { user })
    if (path === '/api/mailboxes') return json(route, { mailboxes: [{
      address: 'inbox@example.com', domain: 'example.com',
      isPrimary: true, isActive: true,
    }] })
    if (path === '/api/domains') return json(route, { domains: [] })
    if (path === '/api/drafts') return json(route, { drafts: [], limit: 5 })
    if (path === '/api/messages/message-1/translation') {
      requestedTarget = request.postDataJSON().targetLanguage
      return json(route, { translation: {
        sourceLanguage: 'hr', targetLanguage: 'zh', cached: false,
        subject: '欢迎使用 OmniMail', text: '你的 A1 eSIM 已准备就绪。',
        html: `<html lang="zh"><body>
          <table class="translated-layout"><tr><td>
            <a href="https://example.com/activate"><strong>你的 A1 eSIM</strong></a>
            <p>你的 A1 eSIM 已准备就绪。</p>
          </td></tr></table>
        </body></html>`,
      } })
    }
    if (path === '/api/messages/message-1') return json(route, {
      message: {
        ...message, messageId: null, inReplyTo: null, references: null,
        cc: [], text: 'Tvoj A1 eSIM je spreman.',
        html: '<html lang="hr"><body><p class="original-copy">Tvoj A1 eSIM je spreman.</p></body></html>',
        attachments: [],
      },
      thread: [message],
    })
    if (path === '/api/messages') return json(route, {
      unchanged: false, version: 1, messages: [message],
      counts: { unread: 0, starred: 0, sent: 0, trash: 0 },
      page: { hasMore: false, nextCursor: null, limit: 30 },
    })
    return route.fulfill({ status: 500, body: `Unhandled route: ${path}` })
  })

  await page.goto('/')
  await page.getByText('Welcome to OmniMail').click()
  const reader = page.locator('.message-reader')
  const stack = page.locator('.email-frame-stack')
  const originalFrame = page.locator('iframe.email-frame.is-active')
  await expect(reader).not.toHaveClass(/message-reader--preparing/)
  await reader.evaluate((element) => {
    element.setAttribute('data-translation-preparing-seen', 'false')
    new MutationObserver(() => {
      if (element.classList.contains('message-reader--preparing')) {
        element.setAttribute('data-translation-preparing-seen', 'true')
      }
    }).observe(element, { attributes: true, attributeFilter: ['class'] })
  })
  await stack.evaluate((element) => {
    element.setAttribute('data-active-frame-gap-seen', 'false')
    element.setAttribute('data-brightness-gap-seen', 'false')
    let activeSlot = element.querySelector('iframe.is-active')?.getAttribute('data-frame-slot')
    new MutationObserver(() => {
      const active = element.querySelector<HTMLIFrameElement>('iframe.is-active')
      if (!active) {
        element.setAttribute('data-active-frame-gap-seen', 'true')
        return
      }
      const nextSlot = active.getAttribute('data-frame-slot')
      if (nextSlot === activeSlot) return
      activeSlot = nextSlot
      let samples = 0
      const sampleTransition = () => {
        const currentActive = element.querySelector<HTMLIFrameElement>('iframe.is-active')
        const retiring = element.querySelector<HTMLIFrameElement>('iframe.is-retiring')
        if (currentActive && Number.parseFloat(getComputedStyle(currentActive).opacity) < 0.999
          && (!retiring || Number.parseFloat(getComputedStyle(retiring).opacity) < 0.999)) {
          element.setAttribute('data-brightness-gap-seen', 'true')
        }
        samples += 1
        if (samples < 20) requestAnimationFrame(sampleTransition)
      }
      requestAnimationFrame(sampleTransition)
    }).observe(element, { subtree: true, attributes: true, attributeFilter: ['class'] })
  })
  const originalSlot = await originalFrame.getAttribute('data-frame-slot')
  await page.getByRole('button', { name: '翻译为 简体中文' }).click()

  await expect(page.locator('.message-heading h1')).toHaveText('欢迎使用 OmniMail')
  const translatedFrameElement = page.locator('iframe.email-frame.is-active')
  const translatedFrame = page.frameLocator('iframe.email-frame.is-active')
  await expect(translatedFrame.locator('table.translated-layout')).toBeVisible()
  await expect(translatedFrame.locator('strong')).toHaveText('你的 A1 eSIM')
  await expect(translatedFrame.locator('a')).toHaveAttribute(
    'data-omnimail-href',
    'https://example.com/activate',
  )
  expect(await translatedFrameElement.getAttribute('data-frame-slot')).not.toBe(originalSlot)
  await expect(stack).toHaveAttribute('data-active-frame-gap-seen', 'false')
  await expect(stack).toHaveAttribute('data-brightness-gap-seen', 'false')
  await expect(reader).toHaveAttribute('data-translation-preparing-seen', 'false')
  expect(requestedTarget).toBe('zh')

  await page.getByRole('button', { name: '显示原文' }).click()
  await expect(page.locator('.message-heading h1')).toHaveText('Welcome to OmniMail')
  await expect(page.locator('iframe.email-frame.is-active')).toHaveAttribute(
    'data-frame-slot', originalSlot ?? '',
  )
  await expect(page.frameLocator('iframe.email-frame.is-active').locator('.original-copy')).toContainText(
    'Tvoj A1 eSIM je spreman.',
  )
  await expect(stack).toHaveAttribute('data-active-frame-gap-seen', 'false')
  await expect(stack).toHaveAttribute('data-brightness-gap-seen', 'false')
  await expect(reader).toHaveAttribute('data-translation-preparing-seen', 'false')
})
