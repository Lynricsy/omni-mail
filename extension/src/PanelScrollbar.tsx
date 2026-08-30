import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'

interface DragState {
  pointerId: number
  startScrollTop: number
  startY: number
}

export function PanelScrollbar({ scrollRef }: {
  scrollRef: RefObject<HTMLElement | null>
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef<number | null>(null)
  const drag = useRef<DragState | null>(null)
  const [overflow, setOverflow] = useState(false)
  const [visible, setVisible] = useState(false)

  const updateThumb = useCallback(() => {
    const scroll = scrollRef.current
    const rail = railRef.current
    const thumb = thumbRef.current
    if (!scroll || !rail || !thumb) return
    const hasOverflow = scroll.scrollHeight > scroll.clientHeight + 1
    setOverflow(hasOverflow)
    if (!hasOverflow) {
      setVisible(false)
      return
    }
    const railHeight = rail.clientHeight
    const thumbHeight = Math.max(36, railHeight * scroll.clientHeight / scroll.scrollHeight)
    const scrollRange = scroll.scrollHeight - scroll.clientHeight
    const thumbRange = railHeight - thumbHeight
    const top = scrollRange > 0 ? scroll.scrollTop / scrollRange * thumbRange : 0
    thumb.style.height = `${thumbHeight}px`
    thumb.style.transform = `translateY(${top}px)`
  }, [scrollRef])

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const frame = window.requestAnimationFrame(updateThumb)
    const resizeObserver = new ResizeObserver(updateThumb)
    const mutationObserver = new MutationObserver(updateThumb)
    resizeObserver.observe(scroll)
    mutationObserver.observe(scroll, { childList: true, subtree: true, characterData: true })
    scroll.addEventListener('scroll', updateThumb, { passive: true })
    window.addEventListener('resize', updateThumb)
    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      scroll.removeEventListener('scroll', updateThumb)
      window.removeEventListener('resize', updateThumb)
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current)
    }
  }, [scrollRef, updateThumb])

  function enterRail() {
    if (!overflow || drag.current) return
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null
      setVisible(true)
    }, 700)
  }

  function leaveRail() {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    if (!drag.current) setVisible(false)
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const scroll = scrollRef.current
    if (!scroll) return
    event.preventDefault()
    drag.current = {
      pointerId: event.pointerId,
      startScrollTop: scroll.scrollTop,
      startY: event.clientY,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setVisible(true)
  }

  function moveThumb(event: PointerEvent<HTMLDivElement>) {
    const scroll = scrollRef.current
    const rail = railRef.current
    const thumb = thumbRef.current
    const currentDrag = drag.current
    if (!scroll || !rail || !thumb || !currentDrag
      || currentDrag.pointerId !== event.pointerId) return
    const thumbRange = rail.clientHeight - thumb.clientHeight
    const scrollRange = scroll.scrollHeight - scroll.clientHeight
    if (thumbRange <= 0 || scrollRange <= 0) return
    scroll.scrollTop = currentDrag.startScrollTop
      + (event.clientY - currentDrag.startY) * scrollRange / thumbRange
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (!railRef.current?.matches(':hover')) setVisible(false)
  }

  function jumpTo(event: PointerEvent<HTMLDivElement>) {
    if (!visible || event.target === thumbRef.current) return
    const scroll = scrollRef.current
    const rail = railRef.current
    if (!scroll || !rail) return
    const position = (event.clientY - rail.getBoundingClientRect().top) / rail.clientHeight
    scroll.scrollTop = position * scroll.scrollHeight - scroll.clientHeight / 2
  }

  return (
    <div ref={railRef} className={`panel-scrollbar${overflow ? ' has-overflow' : ''}${visible ? ' is-visible' : ''}`}
      aria-hidden="true" onPointerEnter={enterRail} onPointerLeave={leaveRail}
      onPointerDown={jumpTo}>
      <div ref={thumbRef} className="panel-scrollbar__thumb"
        onPointerDown={startDrag} onPointerMove={moveThumb}
        onPointerUp={stopDrag} onPointerCancel={stopDrag} />
    </div>
  )
}
