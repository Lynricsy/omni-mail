import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'

const TOOLTIP_ID = 'omnimail-tooltip'
const TOOLTIP_EXIT_MS = 170

type TooltipTarget = {
  element: HTMLElement
  content: string
}

type TooltipPosition = {
  left: number
  top: number
  arrowLeft: number
  side: 'top' | 'bottom'
}

type RectLike = Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width' | 'height'>

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function resolveTooltipPosition(
  anchor: RectLike,
  tooltip: { width: number; height: number },
  viewport: { width: number; height: number },
): TooltipPosition {
  const margin = 10
  const gap = 9
  const roomAbove = anchor.top - gap - tooltip.height >= margin
  const roomBelow = anchor.bottom + gap + tooltip.height <= viewport.height - margin
  const side = roomAbove || !roomBelow ? 'top' : 'bottom'
  const maximumLeft = Math.max(margin, viewport.width - tooltip.width - margin)
  const left = clamp(
    anchor.left + anchor.width / 2 - tooltip.width / 2,
    margin,
    maximumLeft,
  )
  const preferredTop = side === 'top'
    ? anchor.top - gap - tooltip.height
    : anchor.bottom + gap
  const maximumTop = Math.max(margin, viewport.height - tooltip.height - margin)
  const top = clamp(preferredTop, margin, maximumTop)
  const arrowLeft = clamp(
    anchor.left + anchor.width / 2 - left,
    11,
    Math.max(11, tooltip.width - 11),
  )

  return { left, top, arrowLeft, side }
}

export function TooltipLayer() {
  const [target, setTarget] = useState<TooltipTarget | null>(null)
  const [position, setPosition] = useState<TooltipPosition>({
    left: 0,
    top: 0,
    arrowLeft: 16,
    side: 'top',
  })
  const [ready, setReady] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const describedTargetRef = useRef<{
    element: HTMLElement
    previous: string | null
  } | null>(null)
  const lastShownAtRef = useRef(0)

  useEffect(() => {
    let inputModality: 'keyboard' | 'pointer' = 'pointer'

    const clearTimer = (timer: typeof showTimerRef) => {
      if (!timer.current) return
      clearTimeout(timer.current)
      timer.current = null
    }

    const restoreDescription = () => {
      const described = describedTargetRef.current
      if (!described) return
      if (described.previous) {
        described.element.setAttribute('aria-describedby', described.previous)
      } else {
        described.element.removeAttribute('aria-describedby')
      }
      describedTargetRef.current = null
    }

    const close = (delay = 0) => {
      clearTimer(showTimerRef)
      clearTimer(hideTimerRef)
      clearTimer(unmountTimerRef)
      hideTimerRef.current = setTimeout(() => {
        restoreDescription()
        flushSync(() => setReady(false))
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        unmountTimerRef.current = setTimeout(
          () => setTarget(null),
          reducedMotion ? 0 : TOOLTIP_EXIT_MS,
        )
      }, delay)
    }

    const open = (element: HTMLElement, delay: number) => {
      const content = element.dataset.tooltip?.trim()
      if (!content) return
      clearTimer(showTimerRef)
      clearTimer(hideTimerRef)
      clearTimer(unmountTimerRef)
      showTimerRef.current = setTimeout(() => {
        restoreDescription()
        const previous = element.getAttribute('aria-describedby')
        describedTargetRef.current = { element, previous }
        element.setAttribute(
          'aria-describedby',
          previous ? `${previous} ${TOOLTIP_ID}` : TOOLTIP_ID,
        )
        setReady(false)
        setTarget({ element, content })
        lastShownAtRef.current = Date.now()
      }, delay)
    }

    const findTarget = (event: Event): HTMLElement | null => {
      if (!(event.target instanceof Element)) return null
      return event.target.closest<HTMLElement>('[data-tooltip]')
    }

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== 'mouse') return
      const element = findTarget(event)
      if (!element || (event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) return
      const warm = Date.now() - lastShownAtRef.current < 700
      open(element, warm ? 90 : 300)
    }

    const onPointerOut = (event: PointerEvent) => {
      const element = findTarget(event)
      if (!element || (event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) return
      close(80)
    }

    const onFocusIn = (event: FocusEvent) => {
      const element = findTarget(event)
      if (element && inputModality === 'keyboard') open(element, 100)
    }

    const onFocusOut = (event: FocusEvent) => {
      if (findTarget(event)) close(80)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      inputModality = 'keyboard'
      if (event.key === 'Escape') close()
    }

    const onPointerDown = () => {
      inputModality = 'pointer'
      close()
    }

    const closeImmediately = () => close()

    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('pointerout', onPointerOut)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', closeImmediately)
    window.addEventListener('scroll', closeImmediately, true)

    return () => {
      clearTimer(showTimerRef)
      clearTimer(hideTimerRef)
      clearTimer(unmountTimerRef)
      restoreDescription()
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', closeImmediately)
      window.removeEventListener('scroll', closeImmediately, true)
    }
  }, [])

  useLayoutEffect(() => {
    if (!target || !tooltipRef.current || !target.element.isConnected) return
    const anchor = target.element.getBoundingClientRect()
    const tooltip = tooltipRef.current.getBoundingClientRect()
    setPosition(resolveTooltipPosition(
      anchor,
      tooltip,
      { width: window.innerWidth, height: window.innerHeight },
    ))
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [target])

  if (!target || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={tooltipRef}
      id={TOOLTIP_ID}
      className={`omni-tooltip ${ready ? 'is-visible' : ''}`}
      role="tooltip"
      aria-hidden={!ready}
      data-state={ready ? 'open' : 'closing'}
      data-side={position.side}
      style={{ left: position.left, top: position.top }}
    >
      {target.content}
      <span
        className="omni-tooltip__arrow"
        aria-hidden="true"
        style={{ left: position.arrowLeft }}
      />
    </div>,
    document.body,
  )
}
