(() => {
  const CONTROLLER_KEY = '__omnimailFloatController'
  const existing = (window as typeof window & Record<string, unknown>)[CONTROLLER_KEY] as {
    dispose?: () => void
  } | undefined
  existing?.dispose?.()

  const cleanup: Array<() => void> = []
  const BUTTON_SIZE = 52
  const DOCKED_BUTTON_WIDTH = 44
  const DOCK_GAP = 8
  const DOCK_THRESHOLD = 16
  let host: HTMLDivElement | null = null
  let button: HTMLButtonElement | null = null
  let panel: HTMLElement | null = null
  let frame: HTMLIFrameElement | null = null
  let overlay: HTMLDivElement | null = null
  let panelVisible = false
  let pinned = false
  let docked = false
  let frameLoaded = false
  let lastFocusedInput: HTMLInputElement | null = null
  let bodyObserver: MutationObserver | null = null

  type Layout = {
    button?: { left?: number; top?: number }
    panel?: { left?: number; top?: number; width?: number; height?: number }
    pinned?: boolean
    docked?: boolean
  }

  type PanelBounds = Required<NonNullable<Layout['panel']>>
  let panelBounds: PanelBounds | null = null

  const controller = {
    dispose() {
      cleanup.splice(0).forEach((dispose) => dispose())
      bodyObserver?.disconnect()
      host?.remove()
      host = null
    },
  }
  ;(window as typeof window & Record<string, unknown>)[CONTROLLER_KEY] = controller

  const icon = (path: string, size = 16) => (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" `
    + `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
  )
  const mailIcon = icon('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 6.8 5.1a2 2 0 0 0 2.4 0L20 7"/><path d="M8 2h8"/>', 26)
  const resetIcon = icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>')
  const pinIcon = icon('<path d="M12 17v5"/><path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V17h14v-1.8a2 2 0 0 0-1.1-1.7l-1.8-.9A2 2 0 0 1 15 10.8V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1Z"/>')
  const closeIcon = icon('<path d="m18 6-12 12M6 6l12 12"/>')

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
  }

  function setPosition(element: HTMLElement, left: number, top: number): void {
    element.style.setProperty('left', `${Math.round(left)}px`, 'important')
    element.style.setProperty('top', `${Math.round(top)}px`, 'important')
    element.style.setProperty('right', 'auto', 'important')
    element.style.setProperty('bottom', 'auto', 'important')
  }

  function currentLayout(): Layout {
    if (!button || !panel) return {}
    const buttonRect = button.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    if (panelRect.width && panelRect.height) {
      panelBounds = {
        left: panelRect.left,
        top: panelRect.top,
        width: panelRect.width,
        height: panelRect.height,
      }
    }
    return {
      button: { left: buttonRect.left, top: buttonRect.top },
      panel: panelBounds || undefined,
      pinned,
      docked,
    }
  }

  function persistLayout(): void {
    void chrome.storage.local.set({ floatLayout: currentLayout() })
  }

  function updateButtonState(): void {
    if (!button) return
    button.classList.toggle('is-docked', docked)
    const action = panelVisible ? '收起' : '展开'
    button.title = docked ? `${action}贴边的 OmniMail` : `${action} OmniMail`
    button.setAttribute('aria-label', docked
      ? `${action}贴边的 OmniMail 悬浮邮箱`
      : `${action} OmniMail 悬浮邮箱`)
  }

  function positionDocked(buttonTop: number): void {
    if (!button || !panel || !panelBounds) return
    setPosition(
      button,
      window.innerWidth - DOCKED_BUTTON_WIDTH,
      clamp(buttonTop, 8, window.innerHeight - BUTTON_SIZE - 8),
    )
    const maxLeft = window.innerWidth - panelBounds.width - DOCKED_BUTTON_WIDTH - DOCK_GAP
    const left = Math.max(10, maxLeft)
    const top = clamp(panelBounds.top, 10, window.innerHeight - panelBounds.height - 10)
    setPosition(panel, left, top)
    panelBounds = { ...panelBounds, left, top }
  }

  function undockButton(left?: number): void {
    if (!button || !docked) return
    const top = button.getBoundingClientRect().top
    docked = false
    updateButtonState()
    setPosition(
      button,
      clamp(left ?? window.innerWidth - BUTTON_SIZE - 22, 8, window.innerWidth - BUTTON_SIZE - 8),
      clamp(top, 8, window.innerHeight - BUTTON_SIZE - 8),
    )
  }

  function applyLayout(layout: Layout = {}): void {
    if (!button || !panel) return
    docked = Boolean(layout.docked)
    updateButtonState()
    const buttonWidth = docked ? DOCKED_BUTTON_WIDTH : BUTTON_SIZE
    setPosition(
      button,
      clamp(layout.button?.left ?? window.innerWidth - buttonWidth - 22, 8, window.innerWidth - buttonWidth - 8),
      clamp(layout.button?.top ?? window.innerHeight - BUTTON_SIZE - 22, 8, window.innerHeight - BUTTON_SIZE - 8),
    )

    const width = clamp(layout.panel?.width ?? 440, 360, Math.max(360, window.innerWidth - 20))
    const height = clamp(layout.panel?.height ?? 580, 480, Math.max(480, window.innerHeight - 20))
    panel.style.setProperty('width', `${width}px`, 'important')
    panel.style.setProperty('height', `${height}px`, 'important')
    setPosition(
      panel,
      clamp(layout.panel?.left ?? window.innerWidth - width - 24, 10, window.innerWidth - width - 10),
      clamp(layout.panel?.top ?? Math.max(10, window.innerHeight - height - 78), 10, window.innerHeight - height - 10),
    )
    panelBounds = {
      left: Number.parseFloat(panel.style.left),
      top: Number.parseFloat(panel.style.top),
      width,
      height,
    }
    if (docked) positionDocked(layout.button?.top ?? panelBounds.top)
    pinned = Boolean(layout.pinned)
    panel.querySelector<HTMLButtonElement>('[data-action="pin"]')?.classList.toggle('is-active', pinned)
  }

  function showPanel(): void {
    if (!panel || !frame) return
    if (!frameLoaded) {
      frameLoaded = true
      frame.src = chrome.runtime.getURL('panel.html')
    }
    if (docked) positionDocked(button?.getBoundingClientRect().top ?? panelBounds?.top ?? 8)
    panelVisible = true
    panel.classList.add('is-visible')
    button?.setAttribute('aria-expanded', 'true')
    updateButtonState()
  }

  function hidePanel(): void {
    currentLayout()
    panelVisible = false
    panel?.classList.remove('is-visible')
    button?.setAttribute('aria-expanded', 'false')
    updateButtonState()
  }

  function dockPanel(buttonTop?: number): void {
    if (!button || !panel || pinned) return
    currentLayout()
    docked = true
    updateButtonState()
    positionDocked(buttonTop ?? panelBounds?.top ?? 8)
    hidePanel()
    persistLayout()
  }

  function startMove(
    event: PointerEvent,
    element: HTMLElement,
    onMove?: (left: number, top: number, event: PointerEvent) => void,
    onEnd: () => void = persistLayout,
  ): void {
    if (event.button !== 0) return
    event.preventDefault()
    const rect = element.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    overlay?.style.setProperty('display', 'block', 'important')
    const move = (next: PointerEvent) => {
      const left = rect.left + next.clientX - startX
      const top = rect.top + next.clientY - startY
      if (onMove) onMove(left, top, next)
      else setPosition(
        element,
        clamp(left, 0, window.innerWidth - rect.width),
        clamp(top, 0, window.innerHeight - rect.height),
      )
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      overlay?.style.setProperty('display', 'none', 'important')
      onEnd()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
    window.addEventListener('pointercancel', end, { once: true })
  }

  function createUi(layout: Layout): void {
    if (!document.body || host) return
    host = document.createElement('div')
    host.style.setProperty('all', 'initial', 'important')
    host.style.setProperty('display', 'contents', 'important')
    const shadow = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('link')
    style.rel = 'stylesheet'
    style.href = chrome.runtime.getURL('content.css')
    shadow.appendChild(style)

    button = document.createElement('button')
    button.type = 'button'
    button.className = 'omnimail-float-button'
    button.innerHTML = mailIcon
    button.title = '打开 OmniMail'
    button.setAttribute('aria-label', '打开 OmniMail 悬浮邮箱')
    button.setAttribute('aria-expanded', 'false')

    panel = document.createElement('section')
    panel.className = 'omnimail-float-panel'
    panel.setAttribute('aria-label', 'OmniMail 悬浮邮箱')
    panel.innerHTML = `
      <header class="omnimail-float-header">
        <span class="omnimail-float-title">${icon('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 6.8 5.1a2 2 0 0 0 2.4 0L20 7"/>')}<span>OmniMail</span></span>
        <span class="omnimail-float-actions">
          <button type="button" data-action="reset" title="复位窗口" aria-label="复位窗口">${resetIcon}</button>
          <button type="button" data-action="pin" title="固定窗口" aria-label="固定窗口">${pinIcon}</button>
          <button type="button" data-action="close" title="关闭" aria-label="关闭">${closeIcon}</button>
        </span>
      </header>`
    frame = document.createElement('iframe')
    frame.title = 'OmniMail 邮箱面板'
    frame.allow = 'clipboard-write'
    panel.appendChild(frame)
    overlay = document.createElement('div')
    overlay.className = 'omnimail-float-overlay'
    panel.appendChild(overlay)
    const resize = document.createElement('div')
    resize.className = 'omnimail-float-resize'
    resize.setAttribute('aria-hidden', 'true')
    panel.appendChild(resize)
    shadow.append(button, panel)
    document.body.appendChild(host)
    applyLayout(layout)

    let dragged = false
    button.addEventListener('pointerdown', (event) => {
      dragged = false
      const startX = event.clientX
      const startY = event.clientY
      button?.classList.add('is-dragging')
      startMove(event, button!, (left, top, next) => {
        if (Math.hypot(next.clientX - startX, next.clientY - startY) > 4) dragged = true
        const rect = button!.getBoundingClientRect()
        const nextLeft = clamp(left, 0, window.innerWidth - rect.width)
        setPosition(button!, nextLeft, clamp(top, 0, window.innerHeight - rect.height))
        button?.classList.toggle('is-dock-ready', window.innerWidth - nextLeft - rect.width <= DOCK_THRESHOLD)
      }, () => {
        button?.classList.remove('is-dragging', 'is-dock-ready')
        if (!dragged || !button) return
        const rect = button.getBoundingClientRect()
        if (!pinned && window.innerWidth - rect.right <= DOCK_THRESHOLD) {
          docked = true
          updateButtonState()
          positionDocked(rect.top)
          hidePanel()
        } else {
          undockButton(rect.left)
        }
        persistLayout()
      })
    })
    button.addEventListener('pointerup', () => button?.classList.remove('is-dragging'))
    button.addEventListener('click', () => {
      if (dragged) return
      panelVisible ? hidePanel() : showPanel()
    })

    const header = panel.querySelector<HTMLElement>('.omnimail-float-header')!
    header.addEventListener('pointerdown', (event) => {
      if ((event.target as Element).closest('button')) return
      const startX = event.clientX
      const startY = event.clientY
      let moved = false
      startMove(event, panel!, (left, top, next) => {
        if (Math.hypot(next.clientX - startX, next.clientY - startY) > 4) moved = true
        const rect = panel!.getBoundingClientRect()
        const nextLeft = clamp(left, 0, window.innerWidth - rect.width)
        setPosition(panel!, nextLeft, clamp(top, 0, window.innerHeight - rect.height))
        panel?.classList.toggle(
          'is-dock-ready',
          moved && !pinned && window.innerWidth - nextLeft - rect.width <= DOCK_THRESHOLD,
        )
      }, () => {
        panel?.classList.remove('is-dock-ready')
        if (!moved || !panel) return
        const rect = panel.getBoundingClientRect()
        if (!pinned && window.innerWidth - rect.right <= DOCK_THRESHOLD) {
          dockPanel(rect.top)
          return
        }
        undockButton()
        currentLayout()
        persistLayout()
      })
    })
    panel.querySelector('[data-action="close"]')?.addEventListener('click', hidePanel)
    panel.querySelector('[data-action="pin"]')?.addEventListener('click', (event) => {
      pinned = !pinned
      ;(event.currentTarget as HTMLElement).classList.toggle('is-active', pinned)
      persistLayout()
    })
    panel.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      applyLayout({ pinned })
      persistLayout()
    })
    resize.addEventListener('pointerdown', (event) => {
      const rect = panel!.getBoundingClientRect()
      startMove(event, panel!, (_left, _top, next) => {
        const width = clamp(next.clientX - rect.left, 360, window.innerWidth - rect.left)
        const height = clamp(next.clientY - rect.top, 480, window.innerHeight - rect.top)
        panel!.style.setProperty('width', `${width}px`, 'important')
        panel!.style.setProperty('height', `${height}px`, 'important')
      }, () => {
        currentLayout()
        if (docked) positionDocked(button?.getBoundingClientRect().top ?? panelBounds?.top ?? 8)
        persistLayout()
      })
    })

    bodyObserver = new MutationObserver((mutations) => {
      if (!host || host.parentNode === document.body) return
      if (mutations.some((mutation) => [...mutation.removedNodes].some((node) => node === host || (node instanceof Element && node.contains(host))))) {
        document.body?.appendChild(host)
      }
    })
    bodyObserver.observe(document.body, { childList: true })
  }

  function applyTheme(value: unknown): void {
    if (!host) return
    const theme = value === 'light' || value === 'dark' ? value : 'system'
    host.setAttribute('data-omnimail-theme', theme)
  }

  function removeUi(): void {
    bodyObserver?.disconnect()
    bodyObserver = null
    host?.remove()
    host = null
    button = null
    panel = null
    frame = null
    overlay = null
    panelVisible = false
    frameLoaded = false
  }

  function visibleInput(input: HTMLInputElement): boolean {
    const rect = input.getBoundingClientRect()
    return !input.disabled && !input.readOnly && rect.width > 0 && rect.height > 0
  }

  function looksLikeEmailInput(input: HTMLInputElement): boolean {
    return input.type === 'email'
      || input.autocomplete === 'email'
      || /(?:e-?mail|邮箱)/i.test(`${input.name} ${input.id} ${input.placeholder}`)
  }

  function emailInput(): HTMLInputElement | null {
    if (
      lastFocusedInput
      && document.contains(lastFocusedInput)
      && visibleInput(lastFocusedInput)
      && looksLikeEmailInput(lastFocusedInput)
    ) {
      return lastFocusedInput
    }
    const candidates = [...document.querySelectorAll<HTMLInputElement>('input')]
    return candidates.find((input) => visibleInput(input) && looksLikeEmailInput(input)) ?? null
  }

  function setInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (setter) setter.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.focus()
  }

  function reconcile(): void {
    void chrome.storage.local.get(['floatingEnabled', 'apiOrigin', 'floatLayout', 'theme']).then((settings) => {
      const ownSite = settings.apiOrigin && location.origin === settings.apiOrigin
      if (settings.floatingEnabled !== false && !ownSite) createUi(settings.floatLayout || {})
      else removeUi()
      applyTheme(settings.theme)
    })
  }

  const onFocus = (event: FocusEvent) => {
    if (event.target instanceof HTMLInputElement) lastFocusedInput = event.target
  }
  document.addEventListener('focusin', onFocus, true)
  cleanup.push(() => document.removeEventListener('focusin', onFocus, true))

  const onRuntimeMessage = (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => {
    const request = message as { type?: string; email?: string }
    if (request.type !== 'omnimail:fill-email' || typeof request.email !== 'string') return
    const input = emailInput()
    if (!input) sendResponse({ ok: false, error: '当前页面没有找到邮箱输入框。' })
    else {
      setInputValue(input, request.email)
      sendResponse({ ok: true })
    }
  }
  chrome.runtime.onMessage.addListener(onRuntimeMessage)
  cleanup.push(() => chrome.runtime.onMessage.removeListener(onRuntimeMessage))

  const onWindowMessage = (event: MessageEvent) => {
    if (event.source !== frame?.contentWindow || event.data?.type !== 'omnimail:close-panel') return
    hidePanel()
  }
  window.addEventListener('message', onWindowMessage)
  cleanup.push(() => window.removeEventListener('message', onWindowMessage))

  const onPointerDown = (event: PointerEvent) => {
    if (!panelVisible || pinned || event.composedPath().includes(host as EventTarget)) return
    hidePanel()
  }
  document.addEventListener('pointerdown', onPointerDown, true)
  cleanup.push(() => document.removeEventListener('pointerdown', onPointerDown, true))

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && panelVisible && !pinned) hidePanel()
  }
  document.addEventListener('keydown', onKeyDown, true)
  cleanup.push(() => document.removeEventListener('keydown', onKeyDown, true))

  const onResize = () => {
    if (host) applyLayout(currentLayout())
  }
  window.addEventListener('resize', onResize)
  cleanup.push(() => window.removeEventListener('resize', onResize))

  const onStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && (changes.floatingEnabled || changes.apiOrigin)) reconcile()
    if (area === 'local' && changes.theme) applyTheme(changes.theme.newValue)
  }
  chrome.storage.onChanged.addListener(onStorageChanged)
  cleanup.push(() => chrome.storage.onChanged.removeListener(onStorageChanged))
  reconcile()
})()
