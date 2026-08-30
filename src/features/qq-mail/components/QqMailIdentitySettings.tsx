import { AtSign, LoaderCircle, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { QqMailAccount, QqMailIdentity } from '../../../shared/api'
import { t } from '../../../shared/i18n'

export function QqMailIdentitySettings({ account, busy, adding, onAdd, onDelete }: {
  account: QqMailAccount
  busy: boolean
  adding: boolean
  onAdd: (name: string, email: string) => Promise<boolean>
  onDelete: (identity: QqMailIdentity) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (await onAdd(name, email)) {
      setName('')
      setEmail('')
    }
  }

  return <section className="qq-mail-identities" aria-labelledby={`qq-identities-${account.id}`}>
    <div className="gmail-account-section-heading">
      <span className="gmail-account-section-icon"><AtSign size={16} aria-hidden="true" /></span>
      <span><strong id={`qq-identities-${account.id}`}>{t('邮箱身份')}</strong>
        <small>{t('这些地址共享同一个 QQ 收件箱，只在发信时选择身份。')}</small></span>
    </div>
    <div className="qq-mail-identity-list">
      {account.identities.map((identity) => <article className="qq-mail-identity" key={identity.id}>
        <span><strong>{identity.name}</strong><small>{identity.email}</small></span>
        {identity.isPrimary ? <em>{t('主身份')}</em> : <button
          className="icon-button icon-button--small" type="button" disabled={busy}
          onClick={() => onDelete(identity)}
          aria-label={t('删除发信身份：{address}', { address: identity.email })}
          data-tooltip={t('删除发信身份')}><Trash2 size={15} aria-hidden="true" /></button>}
      </article>)}
    </div>
    <form className="icloud-form qq-mail-identity-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor={`qq-identity-name-${account.id}`}><span>{t('身份名称')}</span>
        <input id={`qq-identity-name-${account.id}`} value={name} maxLength={60} required
          disabled={busy} placeholder={t('例如：Foxmail 邮箱')}
          onChange={(event) => setName(event.target.value)} /></label>
      <label htmlFor={`qq-identity-email-${account.id}`}><span>{t('邮箱地址')}</span>
        <input id={`qq-identity-email-${account.id}`} type="email" value={email}
          maxLength={254} required disabled={busy} placeholder="name@foxmail.com"
          aria-describedby={`qq-identity-help-${account.id}`}
          onChange={(event) => setEmail(event.target.value)} /></label>
      <p id={`qq-identity-help-${account.id}`} className="gmail-account-note">
        <ShieldCheck size={15} aria-hidden="true" />
        {t('添加前会使用当前授权码验证该地址能否登录 QQ SMTP，不会发送测试邮件。')}</p>
      <footer><button className="button button--secondary" type="submit"
        disabled={busy || !name.trim() || !email.trim()}>
        {adding ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
        {t('验证并添加身份')}</button></footer>
    </form>
  </section>
}
