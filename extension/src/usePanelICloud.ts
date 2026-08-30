import { useCallback, useEffect, useRef, useState } from 'react'
import type { ICloudAccount, ICloudAlias } from '../../src/shared/api/api-types'
import { sendExtensionMessage } from './protocol'

interface Options {
  active: boolean
  authorized: boolean
  enabled: boolean
  onError: (message: string) => void
  onNotice: (message: string) => void
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'iCloud 操作失败，请稍后重试。'
}

export function usePanelICloud({ active, authorized, enabled, onError, onNotice }: Options) {
  const accountsRequest = useRef(0)
  const aliasesRequest = useRef(0)
  const [accounts, setAccounts] = useState<ICloudAccount[]>([])
  const [accountsLoaded, setAccountsLoaded] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [aliases, setAliases] = useState<ICloudAlias[]>([])
  const [selectedAlias, setSelectedAlias] = useState('')
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadingAliases, setLoadingAliases] = useState(false)
  const [creating, setCreating] = useState(false)

  const loadAliases = useCallback(async (nextAccountId: string, preferredAlias = '') => {
    const requestId = ++aliasesRequest.current
    if (!nextAccountId) {
      setAliases([])
      setSelectedAlias('')
      return
    }
    setLoadingAliases(true)
    onError('')
    try {
      const [result, saved] = await Promise.all([
        sendExtensionMessage<{ aliases: ICloudAlias[] }>({
          type: 'api:icloud-aliases', accountId: nextAccountId,
        }),
        chrome.storage.local.get(['lastICloudAlias']),
      ])
      if (requestId !== aliasesRequest.current) return
      const nextAliases = result.aliases.filter((alias) => alias.active)
      const savedAlias = typeof saved.lastICloudAlias === 'string' ? saved.lastICloudAlias : ''
      const candidate = preferredAlias || savedAlias
      const nextAlias = nextAliases.some((alias) => alias.email === candidate)
        ? candidate
        : nextAliases[0]?.email || ''
      setAliases(nextAliases)
      setSelectedAlias(nextAlias)
      if (nextAlias) await chrome.storage.local.set({ lastICloudAlias: nextAlias })
    } catch (error) {
      if (requestId === aliasesRequest.current) onError(errorText(error))
    } finally {
      if (requestId === aliasesRequest.current) setLoadingAliases(false)
    }
  }, [onError])

  const loadAccounts = useCallback(async () => {
    const requestId = ++accountsRequest.current
    setLoadingAccounts(true)
    onError('')
    try {
      const [result, saved] = await Promise.all([
        sendExtensionMessage<{ accounts: ICloudAccount[] }>({ type: 'api:icloud-accounts' }),
        chrome.storage.local.get(['lastICloudAccount']),
      ])
      if (requestId !== accountsRequest.current) return
      const nextAccounts = result.accounts.filter((account) => account.hasCookies)
      const savedId = typeof saved.lastICloudAccount === 'string' ? saved.lastICloudAccount : ''
      const nextId = nextAccounts.some((account) => account.id === savedId)
        ? savedId
        : nextAccounts[0]?.id || ''
      setAccounts(nextAccounts)
      setAccountId(nextId)
      setAccountsLoaded(true)
      await loadAliases(nextId)
    } catch (error) {
      if (requestId === accountsRequest.current) {
        setAccountsLoaded(true)
        onError(errorText(error))
      }
    } finally {
      if (requestId === accountsRequest.current) setLoadingAccounts(false)
    }
  }, [loadAliases, onError])

  useEffect(() => {
    if (active && enabled && authorized && !accountsLoaded && !loadingAccounts) {
      void loadAccounts()
    }
  }, [active, accountsLoaded, authorized, enabled, loadAccounts, loadingAccounts])

  useEffect(() => {
    if (authorized) return
    accountsRequest.current += 1
    aliasesRequest.current += 1
    setAccounts([])
    setAliases([])
    setAccountId('')
    setSelectedAlias('')
    setAccountsLoaded(false)
  }, [authorized])

  const selectAccount = useCallback(async (nextAccountId: string) => {
    setAccountId(nextAccountId)
    setSelectedAlias('')
    await chrome.storage.local.set({ lastICloudAccount: nextAccountId })
    await loadAliases(nextAccountId)
  }, [loadAliases])

  const selectAlias = useCallback((email: string) => {
    setSelectedAlias(email)
    if (email) void chrome.storage.local.set({ lastICloudAlias: email })
  }, [])

  const createAlias = useCallback(async (label: string): Promise<string> => {
    if (!accountId || creating) return ''
    setCreating(true)
    onError('')
    try {
      const result = await sendExtensionMessage<{
        alias: Pick<ICloudAlias, 'email' | 'label' | 'createdAt'>
      }>({ type: 'api:create-icloud-alias', accountId, label: label.trim() })
      await loadAliases(accountId, result.alias.email)
      onNotice('iCloud 隐藏邮箱已生成')
      return result.alias.email
    } catch (error) {
      onError(errorText(error))
      return ''
    } finally {
      setCreating(false)
    }
  }, [accountId, creating, loadAliases, onError, onNotice])

  return {
    accountId,
    accounts,
    aliases,
    creating,
    loadingAccounts,
    loadingAliases,
    selectedAlias,
    createAlias,
    loadAccounts,
    loadAliases: () => loadAliases(accountId, selectedAlias),
    selectAccount,
    selectAlias,
  }
}
