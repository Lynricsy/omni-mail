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
    expect(workspaceRoute('/settings/api', 'user')).toMatchObject({
      kind: 'admin',
      view: 'api',
    })
    expect(workspaceRoute('/icloud', 'user')).toMatchObject({
      kind: 'admin',
      view: 'icloud',
    })
    expect(workspaceRoute('/linux-do-mail', 'user')).toMatchObject({
      kind: 'admin',
      view: 'linuxdo-mail',
    })
    expect(workspaceRoute('/gmail', 'user')).toMatchObject({
      kind: 'admin',
      view: 'gmail',
    })
    expect(workspaceRoute('/microsoft', 'user')).toMatchObject({
      kind: 'admin',
      view: 'microsoft',
    })
    expect(workspaceRoute('/naver-mail', 'user')).toMatchObject({
      kind: 'folder',
      folder: 'inbox',
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

  it('falls back to the inbox when an optional mailbox entry is disabled', () => {
    const disabled = {
      iCloudWorkspaceEnabled: false,
      linuxDoMailWorkspaceEnabled: false,
      gmailWorkspaceEnabled: false,
      microsoftWorkspaceEnabled: false,
      qqMailWorkspaceEnabled: false,
      naverMailWorkspaceEnabled: false,
      yandexMailWorkspaceEnabled: false,
    }
    expect(workspaceRoute('/icloud', 'user', disabled)).toMatchObject({
      kind: 'folder', folder: 'inbox', path: '/mail/inbox',
    })
    expect(workspaceRoute('/linux-do-mail', 'admin', disabled)).toMatchObject({
      kind: 'folder', folder: 'inbox', path: '/mail/inbox',
    })
    expect(workspaceRoute('/gmail', 'user', disabled)).toMatchObject({
      kind: 'folder', folder: 'inbox', path: '/mail/inbox',
    })
    expect(workspaceRoute('/microsoft', 'user', disabled)).toMatchObject({
      kind: 'folder', folder: 'inbox', path: '/mail/inbox',
    })
    expect(workspaceRoute('/qq-mail', 'user', disabled)).toMatchObject({
      kind: 'folder', folder: 'inbox', path: '/mail/inbox',
    })
    expect(workspaceRoute('/naver-mail', 'user', disabled)).toMatchObject({
      kind: 'folder', folder: 'inbox', path: '/mail/inbox',
    })
    expect(workspaceRoute('/yandex-mail', 'user', disabled)).toMatchObject({
      kind: 'folder', folder: 'inbox', path: '/mail/inbox',
    })
    expect(workspaceRoute('/naver-mail', 'user', {
      ...disabled,
      naverMailWorkspaceEnabled: true,
    })).toMatchObject({ kind: 'admin', view: 'naver-mail' })
    expect(workspaceRoute('/yandex-mail', 'user', {
      ...disabled,
      yandexMailWorkspaceEnabled: true,
    })).toMatchObject({ kind: 'admin', view: 'yandex-mail' })
  })
})
