import { useEffect, useRef, useState } from 'react'

const TYPEWRITER_PAUSE_MS = 45

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function graphemes(value: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(segmenter.segment(value), ({ segment }) => segment)
  }
  return Array.from(value)
}

export function typewriterFrame(
  from: string,
  to: string,
  elapsedMs: number,
): { text: string; complete: boolean } {
  if (from === to) return { text: to, complete: true }

  const fromCharacters = graphemes(from)
  const toCharacters = graphemes(to)
  const eraseDuration = fromCharacters.length
    ? clamp(fromCharacters.length * 12, 80, 260) : 0
  const typeDuration = toCharacters.length
    ? clamp(toCharacters.length * 18, 120, 620) : 0
  const pauseDuration = fromCharacters.length && toCharacters.length
    ? TYPEWRITER_PAUSE_MS : 0
  const elapsed = Math.max(0, elapsedMs)

  if (elapsed < eraseDuration) {
    const remaining = Math.ceil(
      fromCharacters.length * (1 - elapsed / eraseDuration),
    )
    return { text: fromCharacters.slice(0, remaining).join(''), complete: false }
  }
  if (elapsed < eraseDuration + pauseDuration) {
    return { text: '', complete: false }
  }
  if (elapsed < eraseDuration + pauseDuration + typeDuration) {
    const progress = (elapsed - eraseDuration - pauseDuration) / typeDuration
    const visible = Math.floor(toCharacters.length * progress)
    return { text: toCharacters.slice(0, visible).join(''), complete: false }
  }
  return { text: to, complete: true }
}

function useTypewriterText(target: string) {
  const currentText = useRef(target)
  const [state, setState] = useState({ text: target, active: false })

  useEffect(() => {
    if (target === currentText.current) {
      setState((current) => current.active
        ? { text: target, active: false }
        : current)
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      currentText.current = target
      setState({ text: target, active: false })
      return
    }

    const from = currentText.current
    const startedAt = performance.now()
    let animationFrame = 0
    setState({ text: from, active: true })

    const update = (timestamp: number) => {
      const next = typewriterFrame(from, target, timestamp - startedAt)
      if (next.text !== currentText.current || next.complete) {
        currentText.current = next.text
        setState({ text: next.text, active: !next.complete })
      }
      if (!next.complete) animationFrame = requestAnimationFrame(update)
    }
    animationFrame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animationFrame)
  }, [target])

  return state
}

export function MessageReaderToolbarTitle({
  detailsLabel,
  scrollTopLabel,
  subject,
  subjectPinned,
  onScrollTop,
}: {
  detailsLabel: string
  scrollTopLabel: string
  subject: string
  subjectPinned: boolean
  onScrollTop: () => void
}) {
  const target = subjectPinned ? subject : detailsLabel
  const typewriter = useTypewriterText(target)
  const visibleText = typewriter.text || '\u00a0'
  const animatedText = (
    <span
      className={`reader-toolbar__typewriter${typewriter.active ? ' is-typing' : ''}`}
      aria-hidden="true"
    >
      {visibleText}
    </span>
  )

  return (
    <h2 className="reader-toolbar__title">
      {subjectPinned ? (
        <button
          className="reader-toolbar__subject"
          type="button"
          onClick={onScrollTop}
          aria-label={`${scrollTopLabel}：${subject}`}
          data-tooltip={`${subject} · ${scrollTopLabel}`}
        >
          {animatedText}
        </button>
      ) : (
        <>
          {animatedText}
          <span className="sr-only">{detailsLabel}</span>
        </>
      )}
    </h2>
  )
}
