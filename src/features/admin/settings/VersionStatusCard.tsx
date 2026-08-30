import {
  AlertCircle,
  BadgeCheck,
  ExternalLink,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import packageMetadata from '../../../../package.json'
import { api, type SystemVersion } from '../../../shared/api'
import { t } from '../../../shared/i18n'

export function VersionStatusCard() {
  const [version, setVersion] = useState<SystemVersion | null>(null)
  const [loading, setLoading] = useState(true)
  const [requestFailed, setRequestFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setRequestFailed(false)
    try {
      setVersion(await api.systemVersion())
    } catch {
      setRequestFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const currentVersion = version?.currentVersion || packageMetadata.version
  const checkFailed = requestFailed || Boolean(version?.checkFailed)
  const hasUpdate = Boolean(version?.updateAvailable && version.latestVersion)
  const status = loading
    ? <><LoaderCircle className="spin" size={15} />{t('正在检查更新…')}</>
    : hasUpdate
      ? <><Sparkles size={15} />{t('发现新版本 {version}', {
        version: `v${version?.latestVersion}`,
      })}</>
      : checkFailed
        ? <><AlertCircle size={15} />{t('暂时无法检查更新')}</>
        : version?.latestVersion
          ? <><BadgeCheck size={15} />{t('已是最新版')}</>
          : <><AlertCircle size={15} />{t('暂未找到已发布版本')}</>

  return (
    <section className="admin-card admin-card--settings version-card">
      <header>
        <PackageCheck size={17} />
        <div>
          <h2>{t('系统版本')}</h2>
          <p>{t('查看当前版本并检查 GitHub Releases 更新')}</p>
        </div>
        <button
          className="icon-button icon-button--small"
          type="button"
          disabled={loading}
          aria-label={t('重新检查更新')}
          data-tooltip={t('重新检查更新')}
          onClick={() => void load()}
        >
          <RefreshCw className={loading ? 'spin' : ''} size={15} />
        </button>
      </header>

      <div className="version-overview">
        <span className="version-number">
          <small>{t('当前版本')}</small>
          <strong>v{currentVersion}</strong>
        </span>
        <span
          className={`version-state${hasUpdate ? ' has-update' : ''}${checkFailed ? ' is-unavailable' : ''}`}
          aria-live="polite"
        >
          {status}
        </span>
      </div>

      {hasUpdate && version ? (
        <>
          <div className="version-update-actions">
            <a
              className="button button--primary button--small"
              href={version.releaseUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t('在 GitHub 查看 v{version}', {
                version: version.latestVersion || '',
              })}<ExternalLink size={14} />
            </a>
          </div>
          <p className="admin-note version-update-note">
            {t('请在自己的 Fork 页面选择 Sync fork → Update branch；同步后由 Cloudflare 重新部署。')}
          </p>
        </>
      ) : (
        <p className="admin-note">
          {t('打开系统设置时会自动检查；发现新版本后会引导你前往 GitHub，应用不会自动更新。')}
        </p>
      )}
    </section>
  )
}
