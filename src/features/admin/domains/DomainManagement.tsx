import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Globe2,
  Link2,
  LoaderCircle,
  Mail,
  PauseCircle,
  PlayCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { api, type ManagedDomain } from '../../../shared/api'
import { t } from '../../../shared/i18n'

function errorMessage(error: unknown): string {
  return t(error instanceof Error ? error.message : '域名操作失败，请重试。')
}

export function DomainManagement({
  domains,
  onChanged,
}: {
  domains: ManagedDomain[]
  onChanged: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingDelete, setPendingDelete] = useState<ManagedDomain | null>(null)

  useEffect(() => {
    if (!error && !notice) return
    const timer = window.setTimeout(() => {
      setError('')
      setNotice('')
    }, error ? 5200 : 3200)
    return () => window.clearTimeout(timer)
  }, [error, notice])

  async function run(key: string, action: () => Promise<void>, success: string): Promise<boolean> {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      await action()
      await onChanged()
      setNotice(success)
      return true
    } catch (actionError) {
      setError(errorMessage(actionError))
      return false
    } finally {
      setBusy('')
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault()
    const nextName = name.trim().toLowerCase()
    if (!nextName) return
    await run(`add:${nextName}`, async () => {
      await api.createDomain(nextName)
      setName('')
    }, t('域名已添加并允许创建邮箱。'))
  }

  async function toggle(domain: ManagedDomain) {
    await run(`toggle:${domain.name}`, async () => {
      await api.updateDomain(domain.name, !domain.isActive)
    }, t(domain.isActive ? '域名已停止创建新邮箱。' : '域名已重新启用。'))
  }

  async function remove() {
    if (!pendingDelete) return
    const domain = pendingDelete
    const removed = await run(`delete:${domain.name}`, async () => {
      await api.deleteDomain(domain.name)
    }, domain.mailboxCount > 0
      ? t('域名配置已删除，已有邮箱和邮件仍然保留。')
      : t('域名配置已删除。'))
    if (removed) setPendingDelete(null)
  }

  return (
    <section className="admin-card domain-management-card">
      <header>
        <Globe2 size={17} />
        <div>
          <h2>{t('域名管理')}</h2>
          <p>{t('启用或停用新邮箱创建；删除配置前会展示影响范围')}</p>
        </div>
      </header>

      <form className="domain-add-form" onSubmit={add}>
        <label htmlFor="managed-domain-name">{t('添加域名')}</label>
        <div className="domain-add-row">
          <div className="domain-add-input">
            <Globe2 size={17} />
            <input
              id="managed-domain-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="example.com"
              autoComplete="off"
              required
            />
          </div>
          <button
            className="button button--primary button--small"
            type="submit"
            disabled={Boolean(busy) || !name.trim()}
          >
            {busy.startsWith('add:')
              ? <LoaderCircle className="spin" size={15} />
              : <Plus size={15} />}
            {t('添加域名')}
          </button>
        </div>
      </form>

      <div className="managed-domain-list">
        {domains.length ? domains.map((domain) => {
          const toggling = busy === `toggle:${domain.name}`
          const deleting = busy === `delete:${domain.name}`
          return (
            <div className="managed-domain-row" key={domain.name}>
              <span className="managed-domain-icon"><Globe2 size={17} /></span>
              <div className="managed-domain-identity">
                <strong>{domain.name}</strong>
                <small>{t('{count} 个邮箱地址', { count: domain.mailboxCount })}</small>
              </div>
              <span className={`domain-state ${domain.isActive ? 'is-active' : ''}`}>
                <span aria-hidden="true" />
                {t(domain.isActive ? '允许创建' : '已停用')}
              </span>
              <button
                className="button button--secondary button--small"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void toggle(domain)}
              >
                {toggling
                  ? <LoaderCircle className="spin" size={14} />
                  : domain.isActive ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                {t(domain.isActive ? '停用' : '启用')}
              </button>
              <button
                className="button button--secondary button--small domain-delete"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => setPendingDelete(domain)}
                data-tooltip={t('删除域名配置')}
              >
                {deleting
                  ? <LoaderCircle className="spin" size={14} />
                  : <Trash2 size={14} />}
                {t('删除')}
              </button>
            </div>
          )
        }) : <p className="admin-empty">{t('还没有配置可创建邮箱的域名。')}</p>}
      </div>

      <p className="admin-note domain-routing-note">
        {t('添加域名后，仍需要在 Cloudflare Email Routing 中启用该域名，并将 Catch-all 规则指向 OmniMail Worker。')}
      </p>

      {(error || notice) && (
        <button
          className={`domain-toast ${error ? 'is-error' : 'is-success'}`}
          type="button"
          onClick={() => {
            setError('')
            setNotice('')
          }}
          role={error ? 'alert' : 'status'}
        >
          {error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
          <span><strong>{t(error ? '操作没有完成' : '操作成功')}</strong><small>{error || notice}</small></span>
          <X size={15} />
        </button>
      )}

      {pendingDelete && (
        <div className="domain-delete-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) setPendingDelete(null)
        }}>
          <section className="domain-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="domain-delete-title">
            <header>
              <span><AlertTriangle size={22} /></span>
              <div>
                <p className="eyebrow">DELETE DOMAIN</p>
                <h3 id="domain-delete-title">{t('删除 {domain}？', { domain: pendingDelete.name })}</h3>
              </div>
              <button className="icon-button icon-button--small" type="button" disabled={Boolean(busy)} onClick={() => setPendingDelete(null)} aria-label={t('关闭')}>
                <X size={16} />
              </button>
            </header>
            <p className="domain-delete-lead">{t('请先确认删除后的影响。这个操作只删除 OmniMail 中的域名管理配置。')}</p>
            <div className="domain-delete-risks">
              <p><Mail size={17} /><span><strong>{t('{count} 个已有邮箱会保留', { count: pendingDelete.mailboxCount })}</strong><small>{t('邮箱地址、历史邮件和附件不会被删除，并且仍可继续查看。')}</small></span></p>
              <p><Link2 size={17} /><span><strong>{t('相关邀请链接会失效')}</strong><small>{t('使用该域名且尚未注册的邀请将无法继续使用。')}</small></span></p>
              <p><Globe2 size={17} /><span><strong>{t('不会修改 Cloudflare DNS')}</strong><small>{t('Email Routing、MX 和其他 DNS 记录需要在 Cloudflare 中单独管理。')}</small></span></p>
            </div>
            <footer>
              <button className="button button--secondary" type="button" disabled={Boolean(busy)} onClick={() => setPendingDelete(null)}>{t('取消')}</button>
              <button className="button domain-delete-confirm" type="button" disabled={Boolean(busy)} onClick={() => void remove()}>
                {busy.startsWith('delete:')
                  ? <LoaderCircle className="spin" size={16} />
                  : <Trash2 size={16} />}
                {t('确认删除域名')}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  )
}
