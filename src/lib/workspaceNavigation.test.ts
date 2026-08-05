import { describe, expect, it } from 'vitest'
import { workspaceRoute } from './workspaceNavigation'

describe('workspace routes', () => {
  it('maps mailbox and administrator paths to workspace state', () => {
    expect(workspaceRoute('/mail/trash', 'user')).toMatchObject({
      kind: 'folder',
      folder: 'trash',
    })
    expect(workspaceRoute('/mail/drafts', 'user')).toMatchObject({
      kind: 'folder',
      folder: 'drafts',
    })
    expect(workspaceRoute('/admin/users', 'admin')).toMatchObject({
      kind: 'admin',
      view: 'users',
    })
    expect(workspaceRoute('/admin/mail', 'super_admin')).toMatchObject({
      kind: 'admin',
      view: 'mail',
    })
    expect(workspaceRoute('/settings/account/', 'user')).toMatchObject({
      kind: 'admin',
      view: 'account',
    })
  })

  it('falls back to the inbox for unknown or unauthorized paths', () => {
    expect(workspaceRoute('/admin/users', 'user')).toMatchObject({
      kind: 'folder',
      folder: 'inbox',
      path: '/mail/inbox',
    })
    expect(workspaceRoute('/admin/mail', 'admin')).toMatchObject({
      kind: 'folder',
      folder: 'inbox',
      path: '/mail/inbox',
    })
    expect(workspaceRoute('/unknown', 'super_admin')).toMatchObject({
      kind: 'folder',
      folder: 'inbox',
      path: '/mail/inbox',
    })
  })
})
