import {
  Ban,
  ChevronRight,
  HardDrive,
  Languages,
  MailPlus,
  Search,
  Send,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  api,
  type AdminUserTotals,
  type AdminUser,
  type CreateManagedUser,
  type ManagedUserPolicy,
  type PageInfo,
  type User,
} from '../../../shared/api'
import { getLocale, t } from '../../../shared/i18n'
import { roleLabel } from '../../../shared/auth/roles'
import { AdminPageHeader } from '../shell/AdminPageHeader'
import { TemporaryUserExpiry } from '../../auth/components/TemporaryUserExpiry'
import { UserBanDialog } from './UserBanDialog'
import { UserPolicyPanel } from './UserPolicyPanel'
import { UserPolicyFields } from './UserPolicyFields'
import { UserOutboundRateLimit } from './UserOutboundRateLimit'

const initialCreate: CreateManagedUser = {
  email: '',
  displayName: '',
  password: '',
  role: 'user',
  status: 'active',
  mailboxLimit: 1,
  storageQuotaMiB: 1024,
  canCreateMailboxes: false,
  canReply: false,
  canTranslate: true,
}

function policyFor(user: AdminUser): ManagedUserPolicy {
  return {
    role: user.role === 'super_admin' ? 'admin' : user.role,
    status: user.status,
    mailboxLimit: user.mailboxLimit,
    storageQuotaMiB: Math.round(user.storageQuotaBytes / (1024 * 1024)),
    canCreateMailboxes: user.canCreateMailboxes,
    canReply: user.canReply,
    canTranslate: user.canTranslate,
  }
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp * 1000))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, bytes / 1024).toFixed(1)} KiB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`
}

export function UserManagement({
  currentUser,
}: {
  currentUser: User
}) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [totals, setTotals] = useState<AdminUserTotals>({ total: 0, active: 0, disabled: 0 })
  const [page, setPage] = useState<PageInfo>({ hasMore: false, nextCursor: null, limit: 50 })
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [policy, setPolicy] = useState<ManagedUserPolicy | null>(null)
  const [createDraft, setCreateDraft] = useState<CreateManagedUser>(initialCreate)
  const [creating, setCreating] = useState(false)
  const [confirmingBan, setConfirmingBan] = useState(false)

  async function loadUsers(cursor?: string) {
    if (cursor) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const result = await api.adminUsers(cursor)
      setUsers((items) => {
        if (!cursor) return result.users
        const existing = new Set(items.map((item) => item.id))
        return [...items, ...result.users.filter((item) => !existing.has(item.id))]
      })
      setPage(result.page)
      setTotals(result.totals)
    } catch (loadError) {
      setError(t(loadError instanceof Error ? loadError.message : '无法读取用户列表。'))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return users
    return users.filter((user) => (
      user.email.toLowerCase().includes(needle)
      || user.displayName.toLowerCase().includes(needle)
      || roleLabel(user.role).includes(needle)
    ))
  }, [query, users])

  const protectedTarget = Boolean(
    selected
    && (
      selected.role === 'super_admin'
      || selected.id === currentUser.id
      || (currentUser.role === 'admin' && selected.role === 'admin')
    ),
  )

  function openUser(user: AdminUser) {
    setSelected(user)
    setPolicy(policyFor(user))
    setCreating(false)
    setConfirmingBan(false)
    setError('')
  }

  function openCreate() {
    setCreateDraft(initialCreate)
    setSelected(null)
    setPolicy(null)
    setCreating(true)
    setError('')
  }

  function closePanel() {
    setSelected(null)
    setPolicy(null)
    setCreating(false)
    setConfirmingBan(false)
    setError('')
  }
  function updateRateLimit(outboundRateLimit: AdminUser['outboundRateLimit']) {
    const update = (item: AdminUser) => item.id === selected?.id ? { ...item, outboundRateLimit } : item
    setSelected((current) => current ? update(current) : current)
    setUsers((items) => items.map(update))
  }
  function savePolicy(event: FormEvent) {
    event.preventDefault()
    if (!selected || !policy || protectedTarget) return
    if (
      selected.status === 'active'
      && policy.status === 'disabled'
    ) {
      setConfirmingBan(true)
      return
    }
    void persistPolicy()
  }

  async function persistPolicy() {
    if (!selected || !policy || protectedTarget) return
    setSaving(true)
    setError('')
    try {
      const result = await api.updateAdminUser(selected.id, policy)
      setUsers((items) => items.map((item) => item.id === result.user.id ? result.user : item))
      if (selected.status !== result.user.status) {
        setTotals((current) => ({
          ...current,
          active: current.active + (result.user.status === 'active' ? 1 : -1),
          disabled: current.disabled + (result.user.status === 'disabled' ? 1 : -1),
        }))
      }
      setSelected(result.user)
      setPolicy(policyFor(result.user))
      setNotice(t(result.user.status === 'disabled' ? '账户已封禁' : '权限设置已保存'))
    } catch (saveError) {
      setError(t(saveError instanceof Error ? saveError.message : '无法保存用户设置。'))
    } finally {
      setSaving(false)
    }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await api.createAdminUser(createDraft)
      setUsers((items) => [...items, result.user])
      setTotals((current) => ({
        total: current.total + 1,
        active: current.active + 1,
        disabled: current.disabled,
      }))
      setNotice(t('用户已创建，可以使用邮箱密码登录'))
      closePanel()
    } catch (createError) {
      setError(t(createError instanceof Error ? createError.message : '无法创建用户。'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="admin-workspace user-management">
      <AdminPageHeader
        icon={Users}
        eyebrow="ADMIN · ACCOUNTS"
        title={t('用户管理')}
        description={t('控制登录状态、角色、邮箱额度和可使用的邮件能力。')}
        className="user-management__header"
        actions={<div className="user-header-actions">
          <button className="button button--primary user-add-button" type="button" onClick={openCreate}>
            <UserPlus size={16} />
            {t('新增用户')}
          </button>
        </div>}
      />

      <section className="user-summary" aria-label={t('用户概况')}>
        <div><Users size={16} /><span><strong>{totals.total}</strong><small>{t('全部账户')}</small></span></div>
        <div><ShieldCheck size={16} /><span><strong>{totals.active}</strong><small>{t('正常使用')}</small></span></div>
        <div><Ban size={16} /><span><strong>{totals.disabled}</strong><small>{t('已经封禁')}</small></span></div>
      </section>

      <section className="user-directory">
        <header>
          <div>
            <h2>{t('账户列表')}</h2>
            <p>{t('主管理员身份由 Worker 配置保护。')}</p>
          </div>
          <label className="user-search">
            <Search size={16} />
            <span className="sr-only">{t('搜索用户')}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('搜索名称、邮箱或角色')}
              type="search"
            />
          </label>
        </header>

        {loading ? (
          <div className="user-list-state">{t('正在读取用户…')}</div>
        ) : filtered.length ? (
          <div className="managed-user-list">
            <div className="user-list-heading" aria-hidden="true">
              <span>{t('用户')}</span><span>{t('角色')}</span><span>{t('邮箱 / 存储')}</span><span>{t('权限')}</span><span>{t('状态')}</span><span />
            </div>
            {filtered.map((user) => (
              <button className="managed-user-row" type="button" key={user.id} onClick={() => openUser(user)}>
                <span className="managed-user-identity">
                  <span className="managed-user-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
                  <span><strong>{user.displayName}</strong><small>{user.email}</small></span>
                </span>
                <span className="user-role-details">
                  <span className={`role-pill role-pill--${user.role}`}>{roleLabel(user.role)}</span>
                  {user.role === 'temporary' && (
                    <TemporaryUserExpiry expiresAt={user.temporaryExpiresAt} />
                  )}
                </span>
                <span className="user-mailbox-usage">
                  <strong>{user.mailboxCount} / {user.role === 'super_admin' ? t('不限') : user.mailboxLimit}</strong>
                  <small>
                    {formatBytes(user.storageUsedBytes)} / {user.storageQuotaBytes === 0
                      ? t('不限')
                      : formatBytes(user.storageQuotaBytes)}
                  </small>
                </span>
                <span className="user-capabilities">
                  {user.canCreateMailboxes && <span data-tooltip={t('可管理邮箱')}><MailPlus size={14} /></span>}
                  {user.canReply && <span data-tooltip={t('可发信')}><Send size={14} /></span>}
                  {user.canTranslate && <span data-tooltip={t('可翻译')}><Languages size={14} /></span>}
                  {!user.canCreateMailboxes && !user.canReply && !user.canTranslate && <small>{t('基础权限')}</small>}
                </span>
                <span className={`user-status ${user.status === 'active' ? 'is-active' : ''}`}>
                  <span aria-hidden="true" />{t(user.status === 'active' ? '正常' : '已封禁')}
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
            {page.hasMore && !query.trim() && (
              <button
                className="button button--secondary user-load-more"
                type="button"
                disabled={loadingMore}
                onClick={() => page.nextCursor && void loadUsers(page.nextCursor)}
              >
                {t(loadingMore ? '正在加载…' : '加载更多用户')}
              </button>
            )}
          </div>
        ) : (
          <div className="user-list-state">{t('没有符合条件的用户。')}</div>
        )}
      </section>

      <UserPolicyPanel open={Boolean(selected || creating)} onClose={closePanel}>
          <section className="user-panel" role="dialog" aria-modal="true" aria-labelledby="user-panel-title">
            <header>
              <div>
                <p className="eyebrow">{creating ? 'NEW ACCOUNT' : 'ACCOUNT POLICY'}</p>
                <h2 id="user-panel-title">{creating ? t('新增用户') : selected?.displayName}</h2>
                <p>{creating ? t('创建可使用邮箱密码登录的账户。') : selected?.email}</p>
              </div>
              <button className="icon-button" type="button" onClick={closePanel} aria-label={t('关闭')}>
                <X size={17} />
              </button>
            </header>

            {error && <p className="user-panel-error" role="alert">{error}</p>}

            {creating ? (
              <form onSubmit={(event) => void createUser(event)}>
                <div className="user-create-fields">
                  <label><span>{t('显示名称')}</span><input required maxLength={60} value={createDraft.displayName} onChange={(event) => setCreateDraft({ ...createDraft, displayName: event.target.value })} /></label>
                  <label><span>{t('登录邮箱')}</span><input required type="email" value={createDraft.email} onChange={(event) => setCreateDraft({ ...createDraft, email: event.target.value })} /></label>
                  <label><span>{t('初始密码')}</span><input required type="password" minLength={10} maxLength={128} value={createDraft.password} onChange={(event) => setCreateDraft({ ...createDraft, password: event.target.value })} /></label>
                </div>
                <UserPolicyFields
                  value={createDraft}
                  onChange={(next) => setCreateDraft({ ...createDraft, ...next })}
                  allowAdmin={currentUser.role === 'super_admin'}
                  showStatus={false}
                  useRoleDefaults
                />
                <button className="button button--primary user-panel-submit" type="submit" disabled={saving}>
                  <UserPlus size={16} />{t(saving ? '正在创建…' : '创建用户')}
                </button>
              </form>
            ) : policy && selected ? (
              <><form onSubmit={(event) => void savePolicy(event)}>
                <div className="user-panel-meta">
                  <span><UserRound size={15} />{t('创建于 {date}', { date: formatDate(selected.createdAt) })}</span>
                  <span><MailPlus size={15} />{t('已使用 {count} 个邮箱', { count: selected.mailboxCount })}</span>
                  <span><HardDrive size={15} />{formatBytes(selected.storageUsedBytes)} / {selected.storageQuotaBytes === 0 ? t('不限') : formatBytes(selected.storageQuotaBytes)}</span>
                  {selected.role === 'temporary' && (
                    <TemporaryUserExpiry expiresAt={selected.temporaryExpiresAt} />
                  )}
                </div>
                {protectedTarget && (
                  <p className="user-protected-note">
                    <ShieldCheck size={16} />
                    {selected.role === 'super_admin'
                      ? t('主管理员由 Worker 配置保护，不能在网页端降级或封禁。')
                      : t('为了避免权限升级或自我锁定，当前管理员不能修改这个账户。')}
                  </p>
                )}
                <UserPolicyFields
                  value={policy}
                  onChange={setPolicy}
                  allowAdmin={currentUser.role === 'super_admin'}
                  showStatus
                  disabled={protectedTarget}
                />
                {!protectedTarget && (
                  <button className="button button--primary user-panel-submit" type="submit" disabled={saving}>
                    <ShieldCheck size={16} />{t(saving ? '正在保存…' : '保存权限')}
                  </button>
                )}
              </form><UserOutboundRateLimit user={selected} disabled={protectedTarget} onUpdate={updateRateLimit} /></>
            ) : null}
          </section>
      </UserPolicyPanel>

      {confirmingBan && selected && (
        <UserBanDialog
          email={selected.email}
          onCancel={() => setConfirmingBan(false)}
          onConfirm={() => {
            setConfirmingBan(false)
            void persistPolicy()
          }}
        />
      )}

      {notice && (
        <button className="user-notice" type="button" onClick={() => setNotice('')}>
          {notice}<X size={14} />
        </button>
      )}
    </main>
  )
}
