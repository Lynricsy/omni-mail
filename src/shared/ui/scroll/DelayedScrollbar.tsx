import { ArrowUp } from 'lucide-react'
import { t } from '../../i18n'
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

const VISIBILITY_DELAY_MS = 200
const SCROLL_TOP_THRESHOLD = 360

export function DelayedScrollbar({
  children,
  className,
  resetKey,
}: {
  children: ReactNode
  className: string
  resetKey: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)
  const [visible, setVisible] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  function schedule(next: boolean) {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setVisible(next)
      timer.current = null
    }, VISIBILITY_DELAY_MS)
  }

  function pointerEnter(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'touch') schedule(true)
  }

  function pointerLeave(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'touch') schedule(false)
  }

  useLayoutEffect(() => {
    if (root.current) root.current.scrollTop = 0
    setShowScrollTop(false)
  }, [resetKey])

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  function scrollToTop() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    root.current?.scrollTo({
      top: 0,
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }

  return (
    <div
      className={`${className} delayed-scrollbar ${visible ? 'is-scrollbar-visible' : ''}`}
      ref={root}
      onPointerEnter={pointerEnter}
      onPointerLeave={pointerLeave}
      onFocusCapture={() => schedule(true)}
      onBlurCapture={() => schedule(false)}
      onScroll={(event) => setShowScrollTop(event.currentTarget.scrollTop > SCROLL_TOP_THRESHOLD)}
    >
      {children}
      <button
        className={`admin-scroll-top ${showScrollTop ? 'is-visible' : ''}`}
        type="button"
        aria-label={t('回到顶部')}
        aria-hidden={!showScrollTop}
        data-tooltip={t('回到顶部')}
        tabIndex={showScrollTop ? 0 : -1}
        onClick={scrollToTop}
      >
        <ArrowUp size={19} />
      </button>
    </div>
  )
}
