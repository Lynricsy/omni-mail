import { useEffect, useRef, useState } from 'react'

const MAX_REFRESH_DELAY = 120
const REFRESH_LOCK = 'omnimail-mail-refresh-leader'
const PROCESSING_REFRESH_SECONDS = 2

type ProcessingMessage = {
  id: string
  status: string
}

export function nextRefreshDelay(
  current: number,
  base: number,
  changed?: boolean | void,
): number {
  return changed === false
    ? Math.min(MAX_REFRESH_DELAY, Math.max(base, current * 2))
    : base
}

export function hasProcessingMail(messages: ProcessingMessage[]): boolean {
  return messages.some((message) => message.status === 'processing')
}

export function processingMessageReady(
  detailStatus: string | undefined,
  selected: ProcessingMessage | undefined,
): boolean {
  return detailStatus === 'processing'
    && Boolean(selected)
    && selected?.status !== 'processing'
}

function useRefreshLeadership(enabled: boolean): boolean {
  const [leader, setLeader] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setLeader(false)
      return
    }
    const locks = navigator.locks
    if (!locks?.request) {
      setLeader(true)
      return () => setLeader(false)
    }

    let active = true
    let queued: AbortController | undefined
    let release: (() => void) | undefined

    const yieldLeadership = (updateState: boolean) => {
      queued?.abort()
      queued = undefined
      release?.()
      release = undefined
      if (updateState) setLeader(false)
    }
    const acquireLeadership = () => {
      if (!active || document.visibilityState !== 'visible') return
      queued = new AbortController()
      let finish!: () => void
      const hold = new Promise<void>((resolve) => { finish = resolve })
      void locks.request(REFRESH_LOCK, { signal: queued.signal }, async () => {
        queued = undefined
        if (!active || document.visibilityState !== 'visible') return
        release = finish
        setLeader(true)
        await hold
        if (active) setLeader(false)
      }).catch((error: unknown) => {
        if (active && !(error instanceof DOMException && error.name === 'AbortError')) {
          setLeader(true)
        }
      })
    }
    const handleVisibility = () => {
      yieldLeadership(true)
      acquireLeadership()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    acquireLeadership()
    return () => {
      active = false
      document.removeEventListener('visibilitychange', handleVisibility)
      yieldLeadership(false)
    }
  }, [enabled])

  return leader
}

export function useAutoRefresh(
  seconds: number,
  refresh: () => Promise<boolean | void>,
  enabled: boolean,
  adaptive = true,
) {
  const callback = useRef(refresh)
  const leader = useRefreshLeadership(enabled)

  useEffect(() => {
    callback.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled || !leader || seconds <= 0) return
    let stopped = false
    let running = false
    let delay = seconds
    let timer: number | undefined

    const schedule = () => {
      if (!stopped) timer = window.setTimeout(() => void run(), delay * 1000)
    }
    const run = async () => {
      if (running) return
      if (document.visibilityState !== 'visible') {
        schedule()
        return
      }
      running = true
      try {
        const changed = await callback.current()
        delay = adaptive ? nextRefreshDelay(delay, seconds, changed) : seconds
      } finally {
        running = false
        schedule()
      }
    }
    const refreshVisiblePage = () => {
      if (document.visibilityState !== 'visible') return
      delay = seconds
      if (timer !== undefined) window.clearTimeout(timer)
      void run()
    }

    document.addEventListener('visibilitychange', refreshVisiblePage)
    window.addEventListener('focus', refreshVisiblePage)
    schedule()
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', refreshVisiblePage)
      window.removeEventListener('focus', refreshVisiblePage)
    }
  }, [adaptive, enabled, leader, seconds])
}

export function useMailboxRefresh<T extends ProcessingMessage>(
  seconds: number,
  refresh: () => Promise<boolean | void>,
  enabled: boolean,
  messages: T[],
  selectedId: string | null,
  detailStatus: string | undefined,
  reload: (message: T) => Promise<void>,
) {
  const processing = hasProcessingMail(messages)
  useAutoRefresh(
    processing ? PROCESSING_REFRESH_SECONDS : seconds,
    refresh,
    enabled,
    !processing,
  )
  const reloadCallback = useRef(reload)
  useEffect(() => {
    reloadCallback.current = reload
  }, [reload])

  const selected = selectedId
    ? messages.find((message) => message.id === selectedId)
    : undefined
  useEffect(() => {
    if (selected && processingMessageReady(detailStatus, selected)) {
      void reloadCallback.current(selected)
    }
  }, [detailStatus, selected])
}
