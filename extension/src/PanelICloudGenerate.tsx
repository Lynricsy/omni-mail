import {
  Cloud,
  Copy,
  ExternalLink,
  LoaderCircle,
  MailPlus,
  Plus,
  RefreshCw,
  SendToBack,
  ShieldCheck,
} from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { t, useLocale } from '../../src/shared/i18n'
import type { ICloudAccount, ICloudAlias } from '../../src/shared/api/api-types'
import { PanelSelect } from './PanelSelect'

interface Props {
  accountId: string
  accounts: ICloudAccount[]
  aliases: ICloudAlias[]
  authorized: boolean
  busy: boolean
  creating: boolean
  enabled: boolean
  loadingAccounts: boolean
  loadingAliases: boolean
  selectedAlias: string
  onAccount: (accountId: string) => void
  onAlias: (email: string) => void
  onCopy: (address: string) => void
  onFill: (address: string) => void
  onGenerate: (label: string) => Promise<string>
  onOpenWeb: () => void
  onReauthorize: () => void
  onRetry: () => void
  onRetryAliases: () => void
}

function StateCard({ icon, title, description, action, onAction, busy = false }: {
  icon: ReactNode
  title: string
  description: string
  action: string
  onAction: () => void
  busy?: boolean
}) {
  return (
    <div className="page-card icloud-state-card">
      <span className="icloud-state-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      <button className="secondary-button" type="button" disabled={busy} onClick={onAction}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <ExternalLink size={16} />}
        {action}
      </button>
    </div>
  )
}

function AliasSkeleton() {
  return (
    <div className="icloud-alias-skeleton" role="status" aria-label={t('正在同步隐藏邮箱')}>
      <div className="icloud-skeleton-field"><span /><i /></div>
      <div className="icloud-skeleton-actions"><i /><i /></div>
      <span className="sr-only">{t('正在同步隐藏邮箱…')}</span>
    </div>
  )
}

export function PanelICloudGenerate(props: Props) {
  useLocale()
  const [createOpen, setCreateOpen] = useState(false)
  const [label, setLabel] = useState('')

  if (!props.enabled) {
    return <StateCard icon={<Cloud size={21} />} title={t('iCloud 功能尚未启用')}
      description={t('请先在 OmniMail Worker 中配置 iCloud 凭据加密密钥。')}
      action={t('打开网页端')} onAction={props.onOpenWeb} />
  }
  if (!props.authorized) {
    return <StateCard icon={<ShieldCheck size={21} />} title={t('需要更新 Float 授权')}
      description={t('重新授权后即可使用已有隐藏邮箱并在 Float 中查看 iCloud 来信。')}
      action={t('重新授权 Float')} onAction={props.onReauthorize} busy={props.busy} />
  }
  if (props.loadingAccounts) {
    return <div className="page-card icloud-loading-card" role="status">
      <LoaderCircle className="spin" size={19} /><span>{t('正在读取已连接的 iCloud 账号…')}</span>
    </div>
  }
  if (!props.accounts.length) {
    return <StateCard icon={<Cloud size={21} />} title={t('还没有可用的 iCloud 账号')}
      description={t('请先在网页端连接账号并确认 Cookie 可用，Float 不会读取或保存凭据。')}
      action={t('前往 iCloud 工作区')} onAction={props.onOpenWeb} />
  }

  return (
    <>
      <div className="page-card icloud-existing-card">
        <div className="icloud-card-heading">
          <div><strong>{t('使用已有隐藏邮箱')}</strong><span>{t('选择后可直接复制或填入网页')}</span></div>
          <button className="recent-refresh-button" type="button" title={t('刷新已有地址')}
            aria-label={t('刷新已有 iCloud 隐藏邮箱')} disabled={props.loadingAliases}
            onClick={props.onRetryAliases}>
            <RefreshCw className={props.loadingAliases ? 'spin' : ''} size={15} />
          </button>
        </div>
        <div className="form-field">
          <label htmlFor="icloud-account">{t('iCloud 账号')}</label>
          <PanelSelect id="icloud-account" ariaLabel={t('iCloud 账号')} value={props.accountId}
            options={props.accounts.map((account) => ({
              label: `${account.name} · ${account.realEmail || account.icloudEmail || account.host}`,
              value: account.id,
            }))}
            disabled={props.busy} onChange={props.onAccount} />
        </div>
        {props.loadingAliases ? <AliasSkeleton /> : props.aliases.length ? (
          <>
            <div className="form-field">
              <label htmlFor="icloud-existing-alias">{t('已有隐藏邮箱')}</label>
              <PanelSelect id="icloud-existing-alias" ariaLabel={t('已有 iCloud 隐藏邮箱')}
                value={props.selectedAlias}
                options={props.aliases.map((alias) => ({
                  label: alias.label ? `${alias.email} · ${alias.label}` : alias.email,
                  value: alias.email,
                }))}
                disabled={props.busy} onChange={props.onAlias} />
            </div>
            <div className="icloud-existing-actions">
              <button type="button" onClick={() => props.onCopy(props.selectedAlias)}>
                <Copy size={15} />{t('复制地址')}
              </button>
              <button type="button" onClick={() => props.onFill(props.selectedAlias)}>
                <SendToBack size={15} />{t('填入网页')}
              </button>
            </div>
          </>
        ) : (
          <div className="icloud-no-alias"><Cloud size={17} />{t('还没有可用的隐藏邮箱')}</div>
        )}
      </div>

      <button className="secondary-button icloud-create-toggle" type="button"
        aria-expanded={createOpen} aria-controls="icloud-create-form"
        onClick={() => setCreateOpen((open) => !open)}>
        <Plus size={16} />{t(createOpen ? '收起创建表单' : '创建新的隐藏邮箱')}
      </button>
      {createOpen && (
        <form className="page-card icloud-generate-card" id="icloud-create-form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            void props.onGenerate(label).then((address) => {
              if (!address) return
              setLabel('')
              setCreateOpen(false)
            })
          }}>
          <div className="icloud-card-heading"><div><strong>{t('创建新地址')}</strong><span>{t('地址由 iCloud 随机分配')}</span></div><MailPlus size={17} /></div>
          <div className="form-field">
            <label htmlFor="icloud-label">{t('用途标签')} <span>{t('可选')}</span></label>
            <input id="icloud-label" type="text" value={label} maxLength={80}
              autoComplete="off" placeholder={t('例如：购物注册')} disabled={props.creating}
              onChange={(event) => setLabel(event.target.value)} />
          </div>
          <button className="primary-button" type="submit" disabled={props.creating || !props.accountId}>
            {props.creating ? <LoaderCircle className="spin" size={17} /> : <MailPlus size={17} />}
            {t(props.creating ? '正在创建…' : '生成 iCloud 隐藏邮箱')}
          </button>
          <p className="icloud-credential-note"><ShieldCheck size={14} />{t('凭据始终留在 OmniMail Worker 内。')}</p>
        </form>
      )}
      <button className="icloud-web-link" type="button" onClick={props.onOpenWeb}>
        <Cloud size={14} />{t('管理全部别名与账号凭据')}<ExternalLink size={13} />
      </button>
      <button className="icloud-retry-link" type="button" onClick={props.onRetry}>
        <RefreshCw size={13} />{t('重新读取账号')}
      </button>
    </>
  )
}
