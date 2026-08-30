import { useCallback, useEffect, useRef, useState } from 'react'

export function useMessageSearch(query: string, delay = 300) {
  const [searchQuery, setSearchQuery] = useState(query.trim())
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    controller.current?.abort()
    const timer = window.setTimeout(() => setSearchQuery(query.trim()), delay)
    return () => {
      window.clearTimeout(timer)
      controller.current?.abort()
    }
  }, [delay, query])

  const nextSignal = useCallback(() => {
    controller.current?.abort()
    controller.current = new AbortController()
    return controller.current.signal
  }, [])

  return [searchQuery, nextSignal] as const
}
