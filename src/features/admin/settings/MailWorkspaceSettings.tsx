import { AlertCircle, AtSign, Cloud, LoaderCircle, Mail } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { QqMailIcon } from '../../qq-mail/components/QqMailIcon'
import { NaverMailIcon } from '../../naver-mail/components/NaverMailIcon'
import { YandexMailIcon } from '../../yandex-mail/components/YandexMailIcon'

export function MailWorkspaceSettings({
  iCloudWorkspaceEnabled,
  linuxDoMailWorkspaceEnabled,
  gmailWorkspaceEnabled,
  microsoftWorkspaceEnabled,
  qqMailWorkspaceEnabled,
  naverMailWorkspaceEnabled,
  yandexMailWorkspaceEnabled,
  onChange,
}: {
  iCloudWorkspaceEnabled: boolean
  linuxDoMailWorkspaceEnabled: boolean
  gmailWorkspaceEnabled: boolean
  microsoftWorkspaceEnabled: boolean
  qqMailWorkspaceEnabled: boolean
  naverMailWorkspaceEnabled: boolean
  yandexMailWorkspaceEnabled: boolean
  onChange: (settings: {
    iCloudWorkspaceEnabled: boolean
    linuxDoMailWorkspaceEnabled: boolean
    gmailWorkspaceEnabled: boolean
    microsoftWorkspaceEnabled: boolean
    qqMailWorkspaceEnabled: boolean
    naverMailWorkspaceEnabled: boolean
    yandexMailWorkspaceEnabled: boolean
  }) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function toggle(target: 'icloud' | 'linuxdo' | 'gmail' | 'microsoft' | 'qq-mail' | 'naver-mail' | 'yandex-mail') {
    const previous = {
      iCloudWorkspaceEnabled,
      linuxDoMailWorkspaceEnabled,
      gmailWorkspaceEnabled,
      microsoftWorkspaceEnabled,
      qqMailWorkspaceEnabled,
      naverMailWorkspaceEnabled,
      yandexMailWorkspaceEnabled,
    }
    const next = {
      iCloudWorkspaceEnabled: target === 'icloud'
        ? !iCloudWorkspaceEnabled
        : iCloudWorkspaceEnabled,
      linuxDoMailWorkspaceEnabled: target === 'linuxdo'
        ? !linuxDoMailWorkspaceEnabled
        : linuxDoMailWorkspaceEnabled,
      gmailWorkspaceEnabled: target === 'gmail'
        ? !gmailWorkspaceEnabled
        : gmailWorkspaceEnabled,
      microsoftWorkspaceEnabled: target === 'microsoft'
        ? !microsoftWorkspaceEnabled
        : microsoftWorkspaceEnabled,
      qqMailWorkspaceEnabled: target === 'qq-mail'
        ? !qqMailWorkspaceEnabled
        : qqMailWorkspaceEnabled,
      naverMailWorkspaceEnabled: target === 'naver-mail'
        ? !naverMailWorkspaceEnabled
        : naverMailWorkspaceEnabled,
      yandexMailWorkspaceEnabled: target === 'yandex-mail'
        ? !yandexMailWorkspaceEnabled
        : yandexMailWorkspaceEnabled,
    }
    setSaving(true)
    setError('')
    setNotice('')
    onChange(next)
    try {
      const result = await api.updateMailWorkspaceSettings(next)
      onChange(result)
      setNotice(t('邮箱功能入口设置已保存'))
    } catch (saveError) {
      onChange(previous)
      setError(t(saveError instanceof Error ? saveError.message : '无法更新邮箱功能入口。'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-card admin-card--settings mail-workspace-settings">
      <header>
        <Mail size={17} />
        <div>
          <h2>{t('邮箱功能入口')}</h2>
          <p>{t('控制可选邮箱工作区是否显示在导航中')}</p>
        </div>
      </header>
      <div className="mail-workspace-entry-list" aria-busy={saving}>
        <label className="policy-toggle">
          <span><YandexMailIcon width={17} height={17} aria-hidden="true" /><span>
            <strong>{t('Yandex 邮箱入口')}</strong>
            <small>{t(yandexMailWorkspaceEnabled
              ? '所有已登录用户都能从导航进入'
              : '入口已隐藏，已保存的 Yandex 邮箱账号和索引不会删除')}</small>
          </span></span>
          <input type="checkbox" checked={yandexMailWorkspaceEnabled} disabled={saving}
            aria-label={t('Yandex 邮箱入口')}
            onChange={() => void toggle('yandex-mail')} />
        </label>
        <label className="policy-toggle">
          <span><NaverMailIcon width={17} height={17} aria-hidden="true" /><span>
            <strong>{t('NAVER 邮箱入口')}</strong>
            <small>{t(naverMailWorkspaceEnabled
              ? '所有已登录用户都能从导航进入'
              : '入口已隐藏，已保存的 NAVER 邮箱账号和索引不会删除')}</small>
          </span></span>
          <input type="checkbox" checked={naverMailWorkspaceEnabled} disabled={saving}
            aria-label={t('NAVER 邮箱入口')}
            onChange={() => void toggle('naver-mail')} />
        </label>
        <label className="policy-toggle">
          <span><QqMailIcon width={17} height={17} aria-hidden="true" /><span>
            <strong>{t('QQ 邮箱入口')}</strong>
            <small>{t(qqMailWorkspaceEnabled
              ? '所有已登录用户都能从导航进入'
              : '入口已隐藏，已保存的 QQ 邮箱账号和索引不会删除')}</small>
          </span></span>
          <input type="checkbox" checked={qqMailWorkspaceEnabled} disabled={saving}
            aria-label={t('QQ 邮箱入口')}
            onChange={() => void toggle('qq-mail')} />
        </label>
        <label className="policy-toggle">
          <span><Cloud size={17} aria-hidden="true" /><span>
            <strong>{t('iCloud 隐藏邮箱入口')}</strong>
            <small>{t(iCloudWorkspaceEnabled
              ? '所有已登录用户都能从导航进入'
              : '入口已隐藏，已保存的 iCloud 账号不会删除')}</small>
          </span></span>
          <input type="checkbox" checked={iCloudWorkspaceEnabled} disabled={saving}
            aria-label={t('iCloud 隐藏邮箱入口')}
            onChange={() => void toggle('icloud')} />
        </label>
        <label className="policy-toggle">
          <span><Mail size={17} aria-hidden="true" /><span>
            <strong>{t('Microsoft 邮箱入口')}</strong>
            <small>{t(microsoftWorkspaceEnabled
              ? '所有已登录用户都能从导航进入'
              : '入口已隐藏，已保存的 Microsoft 账号和索引不会删除')}</small>
          </span></span>
          <input type="checkbox" checked={microsoftWorkspaceEnabled} disabled={saving}
            aria-label={t('Microsoft 邮箱入口')}
            onChange={() => void toggle('microsoft')} />
        </label>
        <label className="policy-toggle">
          <span><AtSign size={17} aria-hidden="true" /><span>
            <strong>{t('Gmail 邮箱入口')}</strong>
            <small>{t(gmailWorkspaceEnabled
              ? '所有已登录用户都能从导航进入'
              : '入口已隐藏，已保存的 Gmail 账号和索引不会删除')}</small>
          </span></span>
          <input type="checkbox" checked={gmailWorkspaceEnabled} disabled={saving}
            aria-label={t('Gmail 邮箱入口')}
            onChange={() => void toggle('gmail')} />
        </label>
        <label className="policy-toggle">
          <span><Mail size={17} aria-hidden="true" /><span>
            <strong>{t('Linux DO 邮箱入口')}</strong>
            <small>{t(linuxDoMailWorkspaceEnabled
              ? '所有已登录用户都能从导航进入'
              : '入口已隐藏，已保存的 Linux DO 账号不会删除')}</small>
          </span></span>
          <input type="checkbox" checked={linuxDoMailWorkspaceEnabled} disabled={saving}
            aria-label={t('Linux DO 邮箱入口')}
            onChange={() => void toggle('linuxdo')} />
        </label>
      </div>
      {error && <p className="inline-error" role="alert">
        <AlertCircle size={15} />{error}
      </p>}
      <p className="refresh-setting-note" role="status" aria-atomic="true">
        {saving && <LoaderCircle className="spin" size={14} />}
        {saving
          ? t('正在保存入口设置…')
          : notice || t('关闭开关只会隐藏入口，不会删除账号、凭据或邮件。')}
      </p>
    </section>
  )
}
