import {
  AlertCircle,
  AtSign,
  Check,
  Clock3,
  Copy,
  Globe2,
  Languages,
  Link2,
  LoaderCircle,
  MailPlus,
  Send,
  ShieldCheck,
  UserRoundPlus,
} from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  api,
  type CreateTemporaryInvite,
  type ManagedDomain,
  type PageInfo,
  type TemporaryInvite,
} from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { AdminPageHeader } from '../shell/AdminPageHeader'
import { DangerConfirmDialog } from '../../../shared/ui/dialogs/DangerConfirmDialog'
import { InvitationHistory, InviteSelect } from './InvitationControls'

const initialDraft: CreateTemporaryInvite = {
  domain: '',
  accountRole: 'temporary',
  expiresInHours: 24,
  accountLifetimeHours: 24,
  multiUse: false,
  addressMode: 'self_selected',
  assignedLocalPart: '',
  mailboxLimit: 1,
  canCreateMailboxes: false,
  canReply: false,
  canTranslate: false,
}

function errorMessage(error: unknown): string {
  return t(error instanceof Error ? error.message : '发生了未知错误。')
}

export function InvitationManagement({
  registrationProtectionReady,
}: {
  registrationProtectionReady: boolean
}) {
  const [domains, setDomains] = useState<ManagedDomain[]>([])
  const [invites, setInvites] = useState<TemporaryInvite[]>([])
  const [page, setPage] = useState<PageInfo>({ hasMore: false, nextCursor: null, limit: 30 })
  const [draft, setDraft] = useState<CreateTemporaryInvite>(initialDraft)
  const [createdLink, setCreatedLink] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState<TemporaryInvite | null>(null)

  const activeDomains = useMemo(
    () => domains.filter((domain) => domain.isActive),
    [domains],
  )
  const inviteSummary = useMemo(() => ({
    total: invites.length,
    active: invites.filter((invite) => invite.state === 'active').length,
    used: invites.filter((invite) => invite.state === 'used').length,
    unavailable: invites.filter((invite) => (
      ['expired', 'revoked', 'domain_disabled'].includes(invite.state)
    )).length,
  }), [invites])

  useEffect(() => {
    let active = true
    Promise.all([api.domains(), api.temporaryInvites()])
      .then(([domainResult, inviteResult]) => {
        if (!active) return
        const enabled = domainResult.domains.filter((domain) => domain.isActive)
        setDomains(domainResult.domains)
        setInvites(inviteResult.invites)
        setPage(inviteResult.page)
        setDraft((current) => ({
          ...current,
          domain: current.domain || enabled[0]?.name || '',
        }))
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function createInvite(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setCopied(false)
    try {
      const result = await api.createTemporaryInvite(draft)
      const link = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(result.token)}`
      setInvites((items) => [result.invite, ...items])
      setCreatedLink(link)
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setSaving(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(createdLink)
      setCopied(true)
    } catch {
      setError(t('浏览器没有允许复制，请手动选择邀请链接。'))
    }
  }

  async function loadMoreInvites() {
    if (!page.hasMore || !page.nextCursor || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const result = await api.temporaryInvites(page.nextCursor)
      setInvites((items) => [...items, ...result.invites])
      setPage(result.page)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoadingMore(false)
    }
  }

  async function revoke(invite: TemporaryInvite) {
    setError('')
    try {
      await api.revokeTemporaryInvite(invite.id)
      setInvites((items) => items.map((item) => (
        item.id === invite.id ? { ...item, state: 'revoked' } : item
      )))
    } catch (revokeError) {
      setError(errorMessage(revokeError))
    }
  }

  return (
    <main className="admin-workspace invitation-management">
      <AdminPageHeader
        icon={UserRoundPlus}
        eyebrow="ADMIN · INVITATIONS"
        title={t('邀请管理')}
        description={t('创建普通或临时用户邀请，并跟踪使用、过期与撤销状态。')}
      />
      <section className="invite-summary" aria-label={t('邀请概况')}>
        <div><Link2 size={17} /><span><strong>{inviteSummary.total}{page.hasMore ? '+' : ''}</strong><small>{t('邀请记录')}</small></span></div>
        <div><ShieldCheck size={17} /><span><strong>{inviteSummary.active}</strong><small>{t('可用邀请')}</small></span></div>
        <div><UserRoundPlus size={17} /><span><strong>{inviteSummary.used}</strong><small>{t('已完成注册')}</small></span></div>
        <div><Clock3 size={17} /><span><strong>{inviteSummary.unavailable}</strong><small>{t('已失效')}</small></span></div>
      </section>
      <section className="invite-workspace" aria-label={t('邀请管理')}>
        {loading ? (
          <div className="invite-loading"><LoaderCircle className="spin" size={18} />{t('正在读取邀请设置…')}</div>
        ) : (
          <>
            {error && <p className="user-panel-error" role="alert"><AlertCircle size={16} />{error}</p>}
            <form className="invite-form" onSubmit={(event) => void createInvite(event)}>
              <section className="invite-form-section">
                <header className="invite-form-section__header">
                  <span><Globe2 size={18} /></span>
                  <div><h2>{t('邮箱与有效期')}</h2><p>{t('确定邮箱分配方式，并分别设置链接和账号的有效时间。')}</p></div>
                </header>
                <fieldset className="invite-mode">
                  <legend>{t('邀请账号类型')}</legend>
                  <label className={draft.accountRole === 'user' ? 'is-selected' : ''}>
                    <input
                      type="radio"
                      name="account-role"
                      checked={draft.accountRole === 'user'}
                      onChange={() => setDraft({
                        ...draft, accountRole: 'user', canTranslate: true,
                      })}
                    />
                    <span><strong>{t('普通用户')}</strong><small>{t('账号长期有效，使用普通用户默认存储配额。')}</small></span>
                  </label>
                  <label className={draft.accountRole === 'temporary' ? 'is-selected' : ''}>
                    <input
                      type="radio"
                      name="account-role"
                      checked={draft.accountRole === 'temporary'}
                      onChange={() => setDraft({
                        ...draft, accountRole: 'temporary', canTranslate: false,
                      })}
                    />
                    <span><strong>{t('临时用户')}</strong><small>{t('账号按设定时间到期，使用临时用户默认存储配额。')}</small></span>
                  </label>
                </fieldset>
                <fieldset className="invite-mode invite-address-mode">
                  <legend>{t('邮箱分配方式')}</legend>
                  <label className={draft.addressMode === 'assigned' ? 'is-selected' : ''}>
                    <input
                      type="radio"
                      name="address-mode"
                      checked={draft.addressMode === 'assigned'}
                      onChange={() => setDraft({
                        ...draft,
                        addressMode: 'assigned',
                        multiUse: false,
                        mailboxLimit: 1,
                        canCreateMailboxes: false,
                      })}
                    />
                    <span><strong>{t('管理员指定邮箱')}</strong><small>{t('提前固定完整地址；用户注册后直接使用，不能自行新增或更改。')}</small></span>
                  </label>
                  <label className={draft.addressMode === 'self_selected' ? 'is-selected' : ''}>
                    <input
                      type="radio"
                      name="address-mode"
                      checked={draft.addressMode === 'self_selected'}
                      onChange={() => setDraft({ ...draft, addressMode: 'self_selected' })}
                    />
                    <span><strong>{t('用户自选邮箱')}</strong><small>{t('管理员固定域名后缀，用户注册时填写尚未使用的邮箱前缀。')}</small></span>
                  </label>
                </fieldset>

                <div className="invite-form-grid">
                  <div className="invite-field">
                    <span>{t('指定邮箱域名')}</span>
                    <InviteSelect
                      value={draft.domain}
                      label={t('指定邮箱域名')}
                      disabled={!activeDomains.length}
                      options={activeDomains.map((domain) => ({
                        value: domain.name,
                        label: domain.name,
                      }))}
                      onChange={(domain) => setDraft({ ...draft, domain })}
                    />
                    <small>{t(draft.addressMode === 'assigned' ? '该域名将与下方前缀组成固定邮箱。' : '用户只能填写 @ 前面的邮箱名称。')}</small>
                  </div>
                  <div className="invite-field">
                    <span>{t('链接有效时间')}</span>
                    <InviteSelect
                      value={String(draft.expiresInHours)}
                      label={t('链接有效时间')}
                      options={[
                        { value: '1', label: t('1 小时') },
                        { value: '6', label: t('6 小时') },
                        { value: '24', label: t('24 小时') },
                        { value: '72', label: t('3 天') },
                        { value: '168', label: t('7 天') },
                        { value: '720', label: t('30 天') },
                      ]}
                      onChange={(value) => setDraft({
                        ...draft,
                        expiresInHours: Number(value),
                      })}
                    />
                    <small>{t('只控制这个链接可以注册到什么时候。')}</small>
                  </div>
                  {draft.accountRole === 'temporary' && (
                    <div className="invite-field">
                      <span>{t('临时账号有效时间')}</span>
                      <InviteSelect
                        value={String(draft.accountLifetimeHours)}
                        label={t('临时账号有效时间')}
                        options={[
                          { value: '1', label: t('1 小时') },
                          { value: '6', label: t('6 小时') },
                          { value: '24', label: t('24 小时') },
                          { value: '72', label: t('3 天') },
                          { value: '168', label: t('7 天') },
                          { value: '720', label: t('30 天') },
                        ]}
                        onChange={(value) => setDraft({
                          ...draft,
                          accountLifetimeHours: Number(value),
                        })}
                      />
                      <small data-tooltip={t('从注册成功起计算；账号到期删除，邮箱保留。')}>
                        {t('注册后计时；删账号、留邮箱。')}
                      </small>
                    </div>
                  )}
                </div>

                {draft.addressMode === 'assigned' && (
                  <label className="invite-admin-address">
                    <span>{t('管理员指定邮箱')}</span>
                    <span>
                      <AtSign size={16} />
                      <input
                        value={draft.assignedLocalPart}
                        onChange={(event) => setDraft({
                          ...draft,
                          assignedLocalPart: event.target.value.toLowerCase(),
                        })}
                        maxLength={64}
                        placeholder="temporary-user"
                        pattern="[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+"
                        required
                      />
                      <strong>@{draft.domain || t('请选择域名')}</strong>
                    </span>
                    <small>{t('地址会立即为这个邀请预留，注册后成为固定的登录邮箱和收件地址。')}</small>
                  </label>
                )}
              </section>

              <section className="invite-form-section">
                <header className="invite-form-section__header">
                  <span><ShieldCheck size={18} /></span>
                  <div><h2>{t('使用与权限')}</h2><p>{t('控制链接使用人数，以及注册后可以使用的邮箱能力。')}</p></div>
                </header>
                <fieldset className={`invite-mode ${draft.addressMode === 'assigned' ? 'invite-mode--single' : ''}`}>
                  <legend>{t('链接使用方式')}</legend>
                  <label className={!draft.multiUse ? 'is-selected' : ''}>
                    <input
                      type="radio"
                      name="invite-mode"
                      checked={!draft.multiUse}
                      onChange={() => setDraft({ ...draft, multiUse: false })}
                    />
                    <span><strong>{t('单次使用')}</strong><small>{t(draft.addressMode === 'assigned' ? '固定邮箱只能分配给一个用户。' : '首个用户成功注册后，链接立即失效。')}</small></span>
                  </label>
                  {draft.addressMode === 'self_selected' && (
                    <label className={`${draft.multiUse ? 'is-selected' : ''} ${!registrationProtectionReady ? 'is-disabled' : ''}`}>
                      <input
                        type="radio"
                        name="invite-mode"
                        checked={draft.multiUse}
                        disabled={!registrationProtectionReady}
                        onChange={() => setDraft({ ...draft, multiUse: true })}
                      />
                      <span>
                        <strong>{t('多人注册')}</strong>
                        <small>{t(registrationProtectionReady
                          ? '有效期内可多人注册，每次注册都需要通过 Turnstile。'
                          : '配置 Turnstile 后才能创建多人注册链接。')}</small>
                      </span>
                    </label>
                  )}
                </fieldset>

                <div className="invite-permissions">
                  {draft.addressMode === 'self_selected' && (
                    <>
                      <label className="policy-toggle">
                        <span><MailPlus size={17} /><span><strong>{t('允许继续添加邮箱')}</strong><small>{t('注册时创建的首个邮箱不受此开关影响')}</small></span></span>
                        <input
                          type="checkbox"
                          checked={draft.canCreateMailboxes}
                          onChange={(event) => setDraft({
                            ...draft,
                            canCreateMailboxes: event.target.checked,
                            mailboxLimit: event.target.checked ? Math.max(2, draft.mailboxLimit) : 1,
                          })}
                        />
                      </label>
                      <label className="invite-limit">
                        <span>{t('邮箱总数上限')}</span>
                        <input
                          type="number"
                          min={draft.canCreateMailboxes ? 2 : 1}
                          max={100}
                          disabled={!draft.canCreateMailboxes}
                          value={draft.mailboxLimit}
                          onChange={(event) => setDraft({
                            ...draft,
                            mailboxLimit: Math.max(2, Math.min(100, Number(event.target.value))),
                          })}
                        />
                      </label>
                    </>
                  )}
                  <label className="policy-toggle">
                    <span><Send size={17} /><span><strong>{t('允许使用发信服务发信与回复')}</strong><small>{t('Worker 仍需配置有效的发信服务')}</small></span></span>
                    <input
                      type="checkbox"
                      checked={draft.canReply}
                      onChange={(event) => setDraft({ ...draft, canReply: event.target.checked })}
                    />
                  </label>
                  <label className="policy-toggle">
                    <span><Languages size={17} /><span><strong>{t('允许使用 AI 翻译邮件')}</strong><small>{t('允许查看缓存译文并请求新的 AI 翻译')}</small></span></span>
                    <input
                      type="checkbox"
                      checked={draft.canTranslate}
                      onChange={(event) => setDraft({
                        ...draft, canTranslate: event.target.checked,
                      })}
                    />
                  </label>
                </div>
              </section>

              <footer className="invite-form-footer">
                <div><Link2 size={17} /><span><strong>{t('链接仅显示一次')}</strong><small>{t('生成后请立即复制并通过安全渠道发送。')}</small></span></div>
                <button
                  className="button button--primary invite-create-button"
                  type="submit"
                  disabled={saving || !draft.domain || (draft.addressMode === 'assigned' && !draft.assignedLocalPart.trim())}
                >
                  {saving ? <LoaderCircle className="spin" size={17} /> : <Link2 size={17} />}
                  {t(saving ? '正在生成…' : '生成邀请链接')}
                </button>
              </footer>
            </form>

            {createdLink && (
              <section className="created-invite" aria-live="polite">
                <div><Check size={17} /><span><strong>{t('邀请链接已生成')}</strong><small>{t('出于安全考虑，关闭窗口后将无法再次查看完整链接。')}</small></span></div>
                <label>
                  <span className="sr-only">{t('新邀请链接')}</span>
                  <input value={createdLink} readOnly onFocus={(event) => event.target.select()} />
                  <button className="button button--secondary button--small" type="button" onClick={() => void copyLink()}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}{t(copied ? '已复制' : '复制')}
                  </button>
                </label>
              </section>
            )}

            <InvitationHistory
              invites={invites}
              page={page}
              loadingMore={loadingMore}
              onLoadMore={() => void loadMoreInvites()}
              onRevoke={setPendingRevoke}
            />
          </>
        )}
      </section>
      {pendingRevoke && (
        <DangerConfirmDialog
          icon={Link2}
          eyebrow="REVOKE INVITATION"
          title={t('撤销 {target} 的邀请？', {
            target: pendingRevoke.assignedAddress || pendingRevoke.domain,
          })}
          description={t('撤销后，该链接不能再用于注册。已经创建的账号不会受到影响。')}
          impactTitle={t('停止后续注册')}
          impactDescription={t('此操作只会停用邀请链接，不会删除已经注册的账号或邮箱。')}
          confirmLabel={t('确认撤销')}
          onCancel={() => setPendingRevoke(null)}
          onConfirm={() => {
            const invite = pendingRevoke
            setPendingRevoke(null)
            void revoke(invite)
          }}
        />
      )}
    </main>
  )
}
