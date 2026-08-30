import { type ReactNode, useEffect, useRef, useState } from 'react'

const EXIT_DURATION_MS = 190

export function UserPolicyPanel({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const retainedChildren = useRef(children)
  if (open) retainedChildren.current = children

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    setVisible(false)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setMounted(false), reducedMotion ? 0 : EXIT_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!mounted || !open) return
    const frame = window.requestAnimationFrame(() => setVisible(true))
    return () => window.cancelAnimationFrame(frame)
  }, [mounted, open])

  if (!mounted) return null
  const state = open ? (visible ? 'open' : 'opening') : 'closing'
  return (
    <div
      className={`user-panel-backdrop user-policy-backdrop${visible ? ' is-visible' : ''}`}
      data-state={state}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {retainedChildren.current}
    </div>
  )
}
