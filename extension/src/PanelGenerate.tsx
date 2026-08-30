import { Copy, LoaderCircle, MailPlus, SendToBack } from 'lucide-react'
import type { ICloudAccount, ICloudAlias, ManagedDomain, MessageSummary } from '../../src/shared/api/api-types'
import type { MailSourceDescriptor, MailSourceId } from './mail-source'
import { t, useLocale } from '../../src/shared/i18n'
import { PanelICloudGenerate } from './PanelICloudGenerate'
import { PanelMailSourceSelect } from './PanelMailSourceSelect'
import { PanelRecentMail } from './PanelRecentMail'
import { PanelSelect } from './PanelSelect'

interface Props {
  busy: boolean
  canGenerate: boolean
  domain: string
  domains: ManagedDomain[]
  fallbackAddress: string
  generatedAddress: string
  iCloudAccountId: string
  iCloudAccounts: ICloudAccount[]
  iCloudAliases: ICloudAlias[]
  iCloudAuthorized: boolean
  iCloudBusy: boolean
  iCloudCreating: boolean
  iCloudEnabled: boolean
  iCloudLoadingAccounts: boolean
  iCloudLoadingAliases: boolean
  iCloudSelectedAlias: string
  localPart: string
  mailLoading: boolean
  messages: MessageSummary[]
  onCopy: (address: string) => void
  onDomain: (domain: string) => void
  onFill: (address: string) => void
  onGenerate: () => void
  onICloudAccount: (accountId: string) => void
  onICloudAlias: (email: string) => void
  onICloudGenerate: (label: string) => Promise<string>
  onICloudOpenWeb: () => void
  onICloudReauthorize: () => void
  onICloudRetry: () => void
  onICloudRetryAliases: () => void
  onLocalPart: (localPart: string) => void
  onRefresh: () => void
  onSelect: (message: MessageSummary) => void
  onSource: (source: MailSourceId) => void
  randomMailboxPrefix: string
  refreshInterval: number
  refreshing: boolean
  source: MailSourceId
  sources: MailSourceDescriptor[]
}

export function GenerateView(props: Props) {
  useLocale()
  const address = props.generatedAddress || props.fallbackAddress
  const previewLocalPart = props.localPart.trim().toLowerCase()
    || `${props.randomMailboxPrefix}${t('随机字符')}`
  return (
    <section className="panel-page generate-page">
      <header className="page-heading">
        <p className="eyebrow">QUICK MAILBOX</p>
        <h1>{t('快速生成邮箱')}</h1>
        <p>{t('选择已有地址直接使用，或创建新的 OmniMail / iCloud 邮箱。')}</p>
      </header>
      <PanelMailSourceSelect id="generate-mail-source" source={props.source}
        sources={props.sources} onChange={props.onSource} />
      {props.source === 'omnimail' ? (
        <div className="generate-source-panel" role="tabpanel">
          <div className="page-card">
            <div className="mailbox-fields">
              <div className="form-field">
                <label htmlFor="mail-local-part">{t('邮箱前缀')} <span>{t('可选')}</span></label>
                <input id="mail-local-part" type="text" value={props.localPart} maxLength={64}
                  autoComplete="off" spellCheck={false} placeholder={t('留空随机生成')}
                  disabled={props.busy || !props.canGenerate}
                  onChange={(event) => props.onLocalPart(event.target.value)} />
              </div>
              <div className="form-field">
                <label htmlFor="mail-domain">{t('邮箱域名')}</label>
                <PanelSelect id="mail-domain" ariaLabel={t('邮箱域名')} value={props.domain}
                  options={props.domains.map((item) => ({ label: `@${item.name}`, value: item.name }))}
                  disabled={props.busy || !props.canGenerate} onChange={props.onDomain} />
              </div>
            </div>
            <div className="address-preview"><span>{t('即将创建')}</span><strong>{previewLocalPart}@{props.domain || 'domain'}</strong></div>
            <button className="primary-button" type="button"
              disabled={props.busy || !props.domain || !props.canGenerate} onClick={props.onGenerate}>
              {props.busy ? <LoaderCircle className="spin" size={17} /> : <MailPlus size={17} />}
              {props.busy ? t('正在生成…') : props.localPart.trim()
                ? t('创建自定义邮箱') : t('随机生成邮箱')}
            </button>
            {!props.canGenerate && <p className="permission-note">{t('当前账户没有创建邮箱的权限。')}</p>}
          </div>
          {address && <div className="page-card address-result"><span>{t(props.generatedAddress ? '刚刚生成' : '当前邮箱')}</span><strong>{address}</strong><div><button type="button" onClick={() => props.onCopy(address)}><Copy size={15} />{t('复制')}</button><button type="button" onClick={() => props.onFill(address)}><SendToBack size={15} />{t('填入网页')}</button></div></div>}
          {address && <PanelRecentMail messages={props.messages} loading={props.mailLoading}
            refreshing={props.refreshing} refreshInterval={props.refreshInterval}
            onRefresh={props.onRefresh} onSelect={props.onSelect} />}
        </div>
      ) : (
        <div className="generate-source-panel" role="tabpanel">
          <PanelICloudGenerate enabled={props.iCloudEnabled}
            authorized={props.iCloudAuthorized} accounts={props.iCloudAccounts}
            accountId={props.iCloudAccountId} aliases={props.iCloudAliases}
            selectedAlias={props.iCloudSelectedAlias} busy={props.iCloudBusy}
            creating={props.iCloudCreating} loadingAccounts={props.iCloudLoadingAccounts}
            loadingAliases={props.iCloudLoadingAliases} onAccount={props.onICloudAccount}
            onAlias={props.onICloudAlias} onGenerate={props.onICloudGenerate}
            onCopy={props.onCopy} onFill={props.onFill} onOpenWeb={props.onICloudOpenWeb}
            onReauthorize={props.onICloudReauthorize} onRetry={props.onICloudRetry}
            onRetryAliases={props.onICloudRetryAliases} />
        </div>
      )}
    </section>
  )
}
