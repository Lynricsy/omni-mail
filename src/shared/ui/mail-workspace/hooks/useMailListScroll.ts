import { useCallback, useRef } from 'react'
import { scrollElementToTop } from '../../scroll/scrollToTop'

export function useMailListScroll() {
  const listPane = useRef<HTMLElement>(null)
  const scrollToTop = useCallback(() => {
    const list = listPane.current?.querySelector<HTMLElement>('.message-list, .draft-list')
    scrollElementToTop(list ?? null)
  }, [])

  return { listPane, scrollToTop }
}
