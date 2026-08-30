import {
  type FocusEvent,
  type PointerEvent,
  type UIEvent,
  useEffect,
  useRef,
  useState,
} from 'react'

const SHOW_DELAY_MS = 140
const HIDE_DELAY_MS = 320
const SCROLL_HIDE_DELAY_MS = 900

export function useDelayedScrollbarVisibility<T extends HTMLElement>({
  showOnFocus = true,
}: { showOnFocus?: boolean } = {}) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<number | null>(null)
  const hovered = useRef(false)
  const focused = useRef(false)

  function clearTimer() {
    if (timer.current === null) return
    window.clearTimeout(timer.current)
    timer.current = null
  }

  function show(delay = SHOW_DELAY_MS) {
    clearTimer()
    if (!delay) { setVisible(true); return }
    timer.current = window.setTimeout(() => {
      setVisible(true)
      timer.current = null
    }, delay)
  }

  function hide(delay = HIDE_DELAY_MS) {
    clearTimer()
    timer.current = window.setTimeout(() => {
      if (!hovered.current && !focused.current) setVisible(false)
      timer.current = null
    }, delay)
  }

  function onPointerEnter(event: PointerEvent<T>) {
    if (event.pointerType === 'touch') return
    hovered.current = true
    show()
  }

  function onPointerLeave(event: PointerEvent<T>) {
    if (event.pointerType === 'touch') return
    hovered.current = false
    hide()
  }

  function onFocus(_event: FocusEvent<T>) {
    if (!showOnFocus) return
    focused.current = true
    show(0)
  }

  function onBlur(event: FocusEvent<T>) {
    if (!showOnFocus) return
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    focused.current = false
    hide()
  }

  function onScroll(_event: UIEvent<T>) {
    show(0)
    if (!hovered.current && !focused.current) hide(SCROLL_HIDE_DELAY_MS)
  }

  useEffect(() => () => clearTimer(), [])

  return {
    visible,
    handlers: { onPointerEnter, onPointerLeave, onFocus, onBlur, onScroll },
  }
}
