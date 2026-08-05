import { type LucideIcon } from 'lucide-react'
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

export function AdminPageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  className = '',
}: {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
  className?: string
}) {
  const sentinel = useRef<HTMLSpanElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const marker = sentinel.current
    const scrollRoot = marker?.closest<HTMLElement>('.admin-scroll-shell')
    if (!marker || !scrollRoot) return

    const observer = new IntersectionObserver(([entry]) => {
      const rootTop = entry.rootBounds?.top ?? 0
      const pastTop = entry.boundingClientRect.top <= rootTop
      const next = !entry.isIntersecting && pastTop
      setStuck(next)
    }, {
      root: scrollRoot,
      threshold: 0,
    })
    observer.observe(marker)
    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <>
      <span className="admin-page-header__sentinel" ref={sentinel} aria-hidden="true" />
      <header className={`admin-workspace__header ${stuck ? 'is-stuck' : ''} ${className}`.trim()}>
        <span className="admin-workspace__icon"><Icon size={22} /></span>
        <div className="admin-workspace__heading">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions}
      </header>
    </>
  )
}
