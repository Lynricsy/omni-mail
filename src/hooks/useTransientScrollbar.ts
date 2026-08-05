import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

const SCROLL_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ',
])

export function useTransientScrollbar(resetKey: string, delay = 700) {
  const root = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)
  const userIntent = useRef(false)
  const [active, setActive] = useState(false)

  const activate = useCallback(() => {
    userIntent.current = true
    setActive(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      userIntent.current = false
      setActive(false)
      timer.current = null
    }, delay)
  }, [delay])

  useLayoutEffect(() => {
    userIntent.current = false
    setActive(false)
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (root.current) root.current.scrollTop = 0
  }, [resetKey])

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  return {
    root,
    active,
    onWheel: activate,
    onTouchMove: activate,
    onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if (SCROLL_KEYS.has(event.key)) activate()
    },
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.clientX >= event.currentTarget.getBoundingClientRect().right - 18) activate()
    },
    onScroll() {
      if (userIntent.current) activate()
    },
  }
}
