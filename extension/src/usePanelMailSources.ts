import { useCallback, useEffect, useState } from 'react'
import {
  getIndexedSourceAdapter,
  type MailSourceDescriptor,
  type MailSourceId,
} from './mail-source'
import type { MailSourcesResult } from './protocol'

const baseSources: MailSourceDescriptor[] = [
  { id: 'omnimail', label: 'OmniMail', accounts: [] },
]

export function usePanelMailSources(apiOrigin: string) {
  const [generateSource, setGenerateSource] = useState<MailSourceId>('omnimail')
  const [inboxSource, setInboxSource] = useState<MailSourceId>('omnimail')
  const [sources, setSources] = useState<MailSourceDescriptor[]>(baseSources)
  const [unavailable, setUnavailable] = useState<MailSourceId[]>([])
  const [upgradeRequired, setUpgradeRequired] = useState(false)

  useEffect(() => {
    let active = true
    void chrome.storage.local.get(['lastGenerateSource', 'lastInboxSource']).then((saved) => {
      if (!active) return
      const generate = typeof saved.lastGenerateSource === 'string'
        ? saved.lastGenerateSource as MailSourceId : 'omnimail'
      const inbox = typeof saved.lastInboxSource === 'string'
        ? saved.lastInboxSource as MailSourceId : 'omnimail'
      if (sources.some(({ id }) => id === generate)) setGenerateSource(generate)
      if (sources.some(({ id }) => id === inbox)) setInboxSource(inbox)
    })
    return () => { active = false }
  }, [sources])

  const selectGenerateSource = useCallback((source: MailSourceId) => {
    setGenerateSource(source)
    void chrome.storage.local.set({ lastGenerateSource: source })
  }, [])
  const selectInboxSource = useCallback((source: MailSourceId) => {
    setInboxSource(source)
    void chrome.storage.local.set({ lastInboxSource: source })
  }, [])

  const apply = useCallback((result: MailSourcesResult) => {
    setSources(result.sources)
    setUnavailable(result.unavailable)
    setUpgradeRequired(result.upgradeRequired)
    setGenerateSource((current) => result.sources.some(({ id }) => id === current)
      ? current : 'omnimail')
    setInboxSource((current) => result.sources.some(({ id }) => id === current)
      ? current : 'omnimail')
  }, [])

  const reset = useCallback(() => {
    setSources(baseSources)
    setUnavailable([])
    setUpgradeRequired(false)
    setGenerateSource('omnimail')
    setInboxSource('omnimail')
  }, [])

  const openWeb = useCallback((source: MailSourceId) => {
    if (!apiOrigin) return
    const path = getIndexedSourceAdapter(source)?.webPath
      || (source === 'icloud' ? '/icloud' : '/')
    void chrome.tabs.create({ url: new URL(path, apiOrigin).toString() })
  }, [apiOrigin])

  return {
    generateSource, setGenerateSource: selectGenerateSource,
    inboxSource, setInboxSource: selectInboxSource,
    sources, unavailable, upgradeRequired,
    generateSources: sources.filter(({ id }) => id === 'omnimail' || id === 'icloud'),
    apply, reset, openWeb,
  }
}
