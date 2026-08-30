import { Check, ChevronDown, Clock3, Globe2, LoaderCircle, ShieldCheck, UserRoundPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PageInfo, TemporaryInvite } from '../../../shared/api'
import { getLocale, t } from '../../../shared/i18n'

const stateLabels: Record<TemporaryInvite['state'], string> = {
  active: '可使用',
  expired: '已过期',
  used: '已使用',
  revoked: '已撤销',
  domain_disabled: '域名已停用',
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000))
}

function formatDuration(hours: number): string {
  return hours % 24 === 0
    ? t('{count} 天', { count: hours / 24 })
    : t('{count} 小时', { count: hours })
}

export function InviteSelect({
  value,
  options,
  label,
  disabled = false,
  onChange,
}: {
  value: string
  options: Array<{ value: string; label: string }>
  label: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [open])

  return (
    <div className={`invite-select ${open ? 'is-open' : ''}`} ref={root}>
      <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
        disabled={disabled} onClick={() => setOpen((current) => !current)}>
        <span>{selected?.label || t('请选择')}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="invite-select__menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button type="button" role="option" aria-selected={option.value === value}
              className={option.value === value ? 'is-selected' : ''} key={option.value}
              onClick={() => { onChange(option.value); setOpen(false) }}>
              <span>{option.label}</span>
              {option.value === value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function InvitationHistory({ invites, page, loadingMore, onLoadMore, onRevoke }: {
  invites: TemporaryInvite[]
  page: PageInfo
  loadingMore: boolean
  onLoadMore: () => void
  onRevoke: (invite: TemporaryInvite) => void
}) {
  return (
    <section className="invite-history">
      <header>
        <div><h3>{t('最近邀请')}</h3><p>{t('历史记录仅显示状态，不保存可复制的明文链接。')}</p></div>
        <span>{t('{count} 条', { count: invites.length })}</span>
      </header>
      {!invites.length ? (
        <div className="invite-empty"><UserRoundPlus size={21} />{t('还没有用户邀请。')}</div>
      ) : (
        <div className="invite-list">
          {invites.map((invite) => (
            <article className="invite-card" key={invite.id}>
              <header>
                <span className="invite-domain"><Globe2 size={16} /><span><strong>{invite.assignedAddress || invite.domain}</strong><small>{t(invite.accountRole === 'user' ? '普通用户' : '临时用户')} · {invite.addressMode === 'assigned' ? t('管理员指定 · 单次使用') : invite.multiUse ? t('用户自选 · 已注册 {count} 人', { count: invite.useCount }) : t('用户自选 · 单次使用')}</small></span></span>
                <span className={`invite-state invite-state--${invite.state}`}>{t(stateLabels[invite.state])}</span>
              </header>
              <dl className="invite-card__details">
                <div><dt><Clock3 size={14} />{t('链接截止')}</dt><dd className="invite-expiry">{formatDate(invite.expiresAt)}</dd></div>
                <div><dt><UserRoundPlus size={14} />{t('账号有效期')}</dt><dd>{invite.accountLifetimeHours === null ? t('长期有效') : formatDuration(invite.accountLifetimeHours)}</dd></div>
                <div><dt><ShieldCheck size={14} />{t('邮箱权限')}</dt><dd>{invite.canCreateMailboxes ? t('最多 {count} 个邮箱', { count: invite.mailboxLimit }) : t('仅首个邮箱')}{invite.canReply ? ` · ${t('可发信')}` : ''}{invite.canTranslate ? ` · ${t('可翻译')}` : ''}</dd></div>
              </dl>
              <footer>
                <span>{t('创建于 {date}', { date: formatDate(invite.createdAt) })}</span>
                {invite.state === 'active' && (
                  <button type="button" onClick={() => onRevoke(invite)}>{t('撤销')}</button>
                )}
              </footer>
            </article>
          ))}
          {page.hasMore && (
            <button className="button button--secondary invite-load-more" type="button"
              disabled={loadingMore} onClick={onLoadMore}>
              {loadingMore && <LoaderCircle className="spin" size={15} />}
              {t(loadingMore ? '正在加载…' : '加载更多邀请')}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
