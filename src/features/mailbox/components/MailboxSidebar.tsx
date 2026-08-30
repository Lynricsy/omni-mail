import {
  BarChart3,
  AtSign,
  Bell,
  BellOff,
  BookOpen,
  ChevronUp,
  FilePenLine,
  Inbox,
  Cloud,
  Globe2,
  Link2,
  Mail,
  LogOut,
  ScrollText,
  SearchCheck,
  Send,
  Settings2,
  Star,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { type Folder, type MailCounts, type User } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { isAdminRole, roleLabel } from '../../../shared/auth/roles'
import type { MailNotificationControls } from '../hooks/useNewMailNotifications'
import type { AdminView } from '../../../app/navigation/workspaceNavigation'
import { Brand, ThemeToggle } from '../../auth/components/AuthPages'
import { LanguageQuickToggle } from '../../../shared/ui/language/LanguageToggle'
import { QqMailIcon } from '../../qq-mail/components/QqMailIcon'
import { NaverMailIcon } from '../../naver-mail/components/NaverMailIcon'
import { YandexMailIcon } from '../../yandex-mail/components/YandexMailIcon'

export type { AdminView } from '../../../app/navigation/workspaceNavigation'

const GITHUB_URL = 'https://github.com/mibgb65-cloud/OmniMail'
const WEBSITE_URL = 'https://omnimail.aicnos.com'

const folders: Array<{
  id: Folder
  label: string
  icon: typeof Inbox
  count: keyof MailCounts
}> = [
  { id: 'inbox', label: '收件箱', icon: Inbox, count: 'unread' },
  { id: 'starred', label: '星标邮件', icon: Star, count: 'starred' },
  { id: 'drafts', label: '草稿箱', icon: FilePenLine, count: 'drafts' },
  { id: 'sent', label: '已发送', icon: Send, count: 'sent' },
  { id: 'trash', label: '垃圾箱', icon: Trash2, count: 'trash' },
]

const adminItems: Array<{
  id: Exclude<AdminView, 'account'>
  label: string
  icon: typeof BarChart3
  superAdminOnly?: boolean
}> = [
  { id: 'statistics', label: '统计', icon: BarChart3 },
  { id: 'mail', label: '邮件管理', icon: SearchCheck, superAdminOnly: true },
  { id: 'users', label: '用户', icon: Users },
  { id: 'invites', label: '邀请', icon: Link2 },
  { id: 'logs', label: '操作日志', icon: ScrollText },
  { id: 'settings', label: '系统设置', icon: Settings2 },
]

export function folderLabel(folder: Folder): string {
  return t(folders.find((item) => item.id === folder)?.label || '收件箱')
}

export function MailboxSidebar({
  user,
  folder,
  counts,
  adminView,
  iCloudWorkspaceEnabled,
  linuxDoMailWorkspaceEnabled,
  gmailWorkspaceEnabled,
  microsoftWorkspaceEnabled,
  qqMailWorkspaceEnabled,
  naverMailWorkspaceEnabled,
  yandexMailWorkspaceEnabled,
  notifications,
  onFolderChange,
  onAdminViewChange,
  onLogout,
}: {
  user: User
  folder: Folder
  counts: MailCounts
  adminView: AdminView | null
  iCloudWorkspaceEnabled: boolean
  linuxDoMailWorkspaceEnabled: boolean
  gmailWorkspaceEnabled: boolean
  microsoftWorkspaceEnabled: boolean
  qqMailWorkspaceEnabled: boolean
  naverMailWorkspaceEnabled: boolean
  yandexMailWorkspaceEnabled: boolean
  notifications: MailNotificationControls
  onFolderChange: (folder: Folder) => void
  onAdminViewChange: (view: AdminView) => void
  onLogout: () => Promise<void>
}) {
  const showAdmin = isAdminRole(user.role)
  const folderEntryCount = folders.length
    + Number(Boolean(iCloudWorkspaceEnabled))
    + Number(Boolean(linuxDoMailWorkspaceEnabled))
    + Number(Boolean(gmailWorkspaceEnabled))
    + Number(Boolean(microsoftWorkspaceEnabled))
    + Number(Boolean(qqMailWorkspaceEnabled))
    + Number(Boolean(naverMailWorkspaceEnabled))
    + Number(Boolean(yandexMailWorkspaceEnabled))
  const sidebarRef = useRef<HTMLElement>(null)
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)
  const [scrollbarActive, setScrollbarActive] = useState(false)
  const scrollbarTimer = useRef<number | null>(null)

  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) return
    sidebarRef.current?.querySelector<HTMLElement>('.is-active')?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [adminView, folder])

  useEffect(() => () => {
    if (scrollbarTimer.current !== null) window.clearTimeout(scrollbarTimer.current)
  }, [])

  function showScrollbarWhileScrolling() {
    setScrollbarActive(true)
    if (scrollbarTimer.current !== null) window.clearTimeout(scrollbarTimer.current)
    scrollbarTimer.current = window.setTimeout(() => {
      setScrollbarActive(false)
      scrollbarTimer.current = null
    }, 700)
  }

  return (
    <aside className={`mail-sidebar folder-count-${folderEntryCount} ${showAdmin ? 'is-admin' : ''}`} ref={sidebarRef}>
      <div className="sidebar-brand">
        <Brand />
        <nav className="sidebar-brand-links" aria-label={t('OmniMail 项目链接')}>
          <a className="icon-button" href={GITHUB_URL} target="_blank"
            rel="noopener noreferrer" aria-label={t('打开 OmniMail GitHub 仓库')}
            data-tooltip={t('打开 OmniMail GitHub 仓库')}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z" />
            </svg>
          </a>
          <a className="icon-button" href={WEBSITE_URL} target="_blank"
            rel="noopener noreferrer" aria-label={t('打开 OmniMail 官网')}
            data-tooltip={t('打开 OmniMail 官网')}>
            <Globe2 size={16} aria-hidden="true" />
          </a>
        </nav>
      </div>
      <div className="sidebar-theme">
        <ThemeToggle />
        {notifications.supported && <button className="sidebar-notification-toggle" type="button"
          onClick={notifications.toggle}
          aria-label={t(notifications.enabled ? '关闭新邮件通知' : '开启新邮件通知')}
          data-tooltip={t(notifications.enabled ? '关闭新邮件通知' : '开启新邮件通知')}>
          {notifications.enabled ? <Bell size={16} /> : <BellOff size={16} />}
        </button>}
        <LanguageQuickToggle />
      </div>
      <div className={`sidebar-navigation${scrollbarActive ? ' is-scrollbar-active' : ''}`}
        onScroll={showScrollbarWhileScrolling}>
      <nav className={`folder-nav folder-count-${folderEntryCount}`} aria-label={t('邮箱文件夹')}>
        {folders.map((item) => {
          const Icon = item.icon
          const count = counts[item.count]
          return (
            <button
              className={!adminView && folder === item.id ? 'is-active' : ''}
              type="button"
              key={item.id}
              onClick={() => {
                setAdminMenuOpen(false)
                onFolderChange(item.id)
              }}
            >
              <Icon
                size={18}
                fill={item.id === 'starred' && !adminView && folder === item.id
                  ? 'currentColor'
                  : 'none'}
              />
              <span>{t(item.label)}</span>
              {count > 0 && <small>{count > 99 ? '99+' : count}</small>}
            </button>
          )
        })}
        {iCloudWorkspaceEnabled && <button
          className={adminView === 'icloud' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setAdminMenuOpen(false)
            onAdminViewChange('icloud')
          }}
        >
          <Cloud size={18} />
          <span>{t('iCloud 邮箱')}</span>
        </button>}
        {linuxDoMailWorkspaceEnabled && <button
          className={adminView === 'linuxdo-mail' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setAdminMenuOpen(false)
            onAdminViewChange('linuxdo-mail')
          }}
        >
          <Mail size={18} />
          <span>{t('Linux DO 邮箱')}</span>
        </button>}
        {gmailWorkspaceEnabled && <button
          className={adminView === 'gmail' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setAdminMenuOpen(false)
            onAdminViewChange('gmail')
          }}
        >
          <AtSign size={18} />
          <span>{t('Gmail 邮箱')}</span>
        </button>}
        {microsoftWorkspaceEnabled && <button
          className={adminView === 'microsoft' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setAdminMenuOpen(false)
            onAdminViewChange('microsoft')
          }}
        >
          <Mail size={18} />
          <span>{t('Microsoft 邮箱')}</span>
        </button>}
        {qqMailWorkspaceEnabled && <button
          className={adminView === 'qq-mail' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setAdminMenuOpen(false)
            onAdminViewChange('qq-mail')
          }}
        >
          <QqMailIcon aria-hidden="true" />
          <span>{t('QQ 邮箱')}</span>
        </button>}
        {naverMailWorkspaceEnabled && <button
          className={adminView === 'naver-mail' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setAdminMenuOpen(false)
            onAdminViewChange('naver-mail')
          }}
        >
          <NaverMailIcon aria-hidden="true" />
          <span>{t('NAVER 邮箱')}</span>
        </button>}
        {yandexMailWorkspaceEnabled && <button
          className={adminView === 'yandex-mail' ? 'is-active' : ''}
          type="button"
          onClick={() => {
            setAdminMenuOpen(false)
            onAdminViewChange('yandex-mail')
          }}
        >
          <YandexMailIcon aria-hidden="true" />
          <span>{t('Yandex 邮箱')}</span>
        </button>}
      </nav>

      {showAdmin && (
        <>
          <button
            className={`admin-nav-toggle${adminView && adminView !== 'account' ? ' has-active-admin' : ''}`}
            type="button"
            aria-controls="mobile-admin-navigation"
            aria-expanded={adminMenuOpen}
            aria-label={t(adminMenuOpen ? '收起管理员功能' : '展开管理员功能')}
            onClick={() => setAdminMenuOpen((open) => !open)}
          >
            <ChevronUp size={17} aria-hidden="true" />
          </button>
          <nav
            id="mobile-admin-navigation"
            className={`admin-nav${adminMenuOpen ? ' is-open' : ''}`}
            aria-label={t('管理员功能')}
          >
            {adminItems.filter((item) => !item.superAdminOnly || user.role === 'super_admin').map((item) => {
              const Icon = item.icon
              return (
                <button
                  className={adminView === item.id ? 'is-active' : ''}
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setAdminMenuOpen(false)
                    onAdminViewChange(item.id)
                  }}
                >
                  <Icon size={18} />
                  <span>{t(item.label)}</span>
                </button>
              )
            })}
          </nav>
        </>
      )}

      <nav className="account-nav" aria-label={t('个人账户')}>
        <span className="account-nav-secondary">
          <button
            className={adminView === 'api' ? 'is-active' : ''}
            type="button"
            onClick={() => {
              setAdminMenuOpen(false)
              onAdminViewChange('api')
            }}
          >
            <BookOpen size={18} />
            <span>{t('API 使用')}</span>
          </button>
        </span>
        <button
          className={adminView === 'account'
            ? 'is-active'
            : adminView === 'api'
              ? 'is-active-mobile'
              : ''}
          type="button"
          onClick={() => {
            setAdminMenuOpen(false)
            onAdminViewChange('account')
          }}
        >
          <UserCog size={18} />
          <span>{t('账号设置')}</span>
        </button>
      </nav>
      </div>

      <div className="sidebar-account">
        <span className="account-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{user.displayName}</strong>
          <span>{user.email}</span>
          <small className="account-role">{roleLabel(user.role)}</small>
        </div>
        <button
          className="icon-button icon-button--small"
          type="button"
          onClick={() => void onLogout()}
          aria-label={t('退出登录')}
          data-tooltip={t('退出登录')}
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
