import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Folder, UserRole } from '../../shared/api'
import { isAdminRole } from '../../shared/auth/roles'

export type AdminView = 'statistics' | 'mail' | 'users' | 'invites' | 'logs' | 'settings' | 'account' | 'api' | 'icloud' | 'linuxdo-mail' | 'gmail' | 'microsoft' | 'qq-mail' | 'naver-mail' | 'yandex-mail'

export type WorkspaceFeatures = {
  iCloudWorkspaceEnabled: boolean
  linuxDoMailWorkspaceEnabled: boolean
  gmailWorkspaceEnabled: boolean
  microsoftWorkspaceEnabled: boolean
  qqMailWorkspaceEnabled: boolean
  naverMailWorkspaceEnabled: boolean
  yandexMailWorkspaceEnabled: boolean
}

const defaultWorkspaceFeatures: WorkspaceFeatures = {
  iCloudWorkspaceEnabled: true,
  linuxDoMailWorkspaceEnabled: true,
  gmailWorkspaceEnabled: true,
  microsoftWorkspaceEnabled: true,
  qqMailWorkspaceEnabled: true,
  naverMailWorkspaceEnabled: false,
  yandexMailWorkspaceEnabled: false,
}

export type WorkspaceRoute =
  | { kind: 'folder'; folder: Folder; path: string }
  | { kind: 'admin'; view: AdminView; path: string }

const folderPaths: Record<Folder, string> = {
  inbox: '/mail/inbox',
  starred: '/mail/starred',
  drafts: '/mail/drafts',
  sent: '/mail/sent',
  trash: '/mail/trash',
}

const adminPaths: Record<AdminView, string> = {
  statistics: '/admin/statistics',
  mail: '/admin/mail',
  users: '/admin/users',
  invites: '/admin/invites',
  logs: '/admin/logs',
  settings: '/admin/settings',
  account: '/settings/account',
  api: '/settings/api',
  icloud: '/icloud',
  'linuxdo-mail': '/linux-do-mail',
  gmail: '/gmail',
  microsoft: '/microsoft',
  'qq-mail': '/qq-mail',
  'naver-mail': '/naver-mail',
  'yandex-mail': '/yandex-mail',
}

function canOpenAdminView(
  view: AdminView,
  role: UserRole,
  features: WorkspaceFeatures,
): boolean {
  if (view === 'icloud') return features.iCloudWorkspaceEnabled
  if (view === 'linuxdo-mail') return features.linuxDoMailWorkspaceEnabled
  if (view === 'gmail') return features.gmailWorkspaceEnabled
  if (view === 'microsoft') return features.microsoftWorkspaceEnabled
  if (view === 'qq-mail') return features.qqMailWorkspaceEnabled
  if (view === 'naver-mail') return features.naverMailWorkspaceEnabled
  if (view === 'yandex-mail') return features.yandexMailWorkspaceEnabled
  if (view === 'account' || view === 'api') return true
  if (view === 'mail') return role === 'super_admin'
  return isAdminRole(role)
}

function normalizedPath(pathname: string): string {
  if (pathname.length <= 1) return pathname
  return pathname.replace(/\/+$/, '')
}

export function workspaceRoute(
  pathname: string,
  role: UserRole,
  features: WorkspaceFeatures = defaultWorkspaceFeatures,
): WorkspaceRoute {
  const path = normalizedPath(pathname)
  const folder = (Object.entries(folderPaths) as Array<[Folder, string]>)
    .find(([, candidate]) => candidate === path)?.[0]
  if (folder) return { kind: 'folder', folder, path: folderPaths[folder] }

  const view = (Object.entries(adminPaths) as Array<[AdminView, string]>)
    .find(([, candidate]) => candidate === path)?.[0]
  if (view && canOpenAdminView(view, role, features)) {
    return { kind: 'admin', view, path: adminPaths[view] }
  }
  return { kind: 'folder', folder: 'inbox', path: folderPaths.inbox }
}

function updatePath(path: string, replace = false) {
  if (normalizedPath(window.location.pathname) === path) {
    if (window.location.pathname !== path) window.history.replaceState(null, '', path)
    return
  }
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path)
}

export function useWorkspaceNavigation(
  role: UserRole,
  features: WorkspaceFeatures = defaultWorkspaceFeatures,
) {
  const stableFeatures = useMemo(() => ({
    iCloudWorkspaceEnabled: features.iCloudWorkspaceEnabled,
    linuxDoMailWorkspaceEnabled: features.linuxDoMailWorkspaceEnabled,
    gmailWorkspaceEnabled: features.gmailWorkspaceEnabled,
    microsoftWorkspaceEnabled: features.microsoftWorkspaceEnabled,
    qqMailWorkspaceEnabled: features.qqMailWorkspaceEnabled,
    naverMailWorkspaceEnabled: features.naverMailWorkspaceEnabled,
    yandexMailWorkspaceEnabled: features.yandexMailWorkspaceEnabled,
  }), [
    features.gmailWorkspaceEnabled,
    features.iCloudWorkspaceEnabled,
    features.linuxDoMailWorkspaceEnabled,
    features.microsoftWorkspaceEnabled,
    features.qqMailWorkspaceEnabled,
    features.naverMailWorkspaceEnabled,
    features.yandexMailWorkspaceEnabled,
  ])
  const initial = workspaceRoute(window.location.pathname, role, stableFeatures)
  const [folder, setFolder] = useState<Folder>(
    initial.kind === 'folder' ? initial.folder : 'inbox',
  )
  const [adminView, setAdminView] = useState<AdminView | null>(
    initial.kind === 'admin' ? initial.view : null,
  )

  useEffect(() => {
    document.documentElement.classList.add('mail-workspace-active')
    return () => document.documentElement.classList.remove('mail-workspace-active')
  }, [])

  useEffect(() => {
    const syncFromLocation = () => {
      const route = workspaceRoute(window.location.pathname, role, stableFeatures)
      setFolder(route.kind === 'folder' ? route.folder : 'inbox')
      setAdminView(route.kind === 'admin' ? route.view : null)
      updatePath(route.path, true)
    }
    syncFromLocation()
    window.addEventListener('popstate', syncFromLocation)
    return () => window.removeEventListener('popstate', syncFromLocation)
  }, [role, stableFeatures])

  const openFolder = useCallback((next: Folder) => {
    setFolder(next)
    setAdminView(null)
    updatePath(folderPaths[next])
  }, [])

  const openAdminView = useCallback((next: AdminView) => {
    if (!canOpenAdminView(next, role, stableFeatures)) return
    setFolder('inbox')
    setAdminView(next)
    updatePath(adminPaths[next])
  }, [role, stableFeatures])

  return { folder, adminView, openFolder, openAdminView }
}
