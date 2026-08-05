import { useCallback, useEffect, useState } from 'react'
import type { Folder, UserRole } from './api'
import { isAdminRole } from './roles'

export type AdminView = 'statistics' | 'mail' | 'users' | 'invites' | 'logs' | 'settings' | 'account'

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
}

function canOpenAdminView(view: AdminView, role: UserRole): boolean {
  if (view === 'account') return true
  if (view === 'mail') return role === 'super_admin'
  return isAdminRole(role)
}

function normalizedPath(pathname: string): string {
  if (pathname.length <= 1) return pathname
  return pathname.replace(/\/+$/, '')
}

export function workspaceRoute(pathname: string, role: UserRole): WorkspaceRoute {
  const path = normalizedPath(pathname)
  const folder = (Object.entries(folderPaths) as Array<[Folder, string]>)
    .find(([, candidate]) => candidate === path)?.[0]
  if (folder) return { kind: 'folder', folder, path: folderPaths[folder] }

  const view = (Object.entries(adminPaths) as Array<[AdminView, string]>)
    .find(([, candidate]) => candidate === path)?.[0]
  if (view && canOpenAdminView(view, role)) {
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

export function useWorkspaceNavigation(role: UserRole) {
  const initial = workspaceRoute(window.location.pathname, role)
  const [folder, setFolder] = useState<Folder>(
    initial.kind === 'folder' ? initial.folder : 'inbox',
  )
  const [adminView, setAdminView] = useState<AdminView | null>(
    initial.kind === 'admin' ? initial.view : null,
  )

  useEffect(() => {
    const syncFromLocation = () => {
      const route = workspaceRoute(window.location.pathname, role)
      setFolder(route.kind === 'folder' ? route.folder : 'inbox')
      setAdminView(route.kind === 'admin' ? route.view : null)
      updatePath(route.path, true)
    }
    syncFromLocation()
    window.addEventListener('popstate', syncFromLocation)
    return () => window.removeEventListener('popstate', syncFromLocation)
  }, [role])

  const openFolder = useCallback((next: Folder) => {
    setFolder(next)
    setAdminView(null)
    updatePath(folderPaths[next])
  }, [])

  const openAdminView = useCallback((next: AdminView) => {
    if (!canOpenAdminView(next, role)) return
    setFolder('inbox')
    setAdminView(next)
    updatePath(adminPaths[next])
  }, [role])

  return { folder, adminView, openFolder, openAdminView }
}
