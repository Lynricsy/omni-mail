import {
  AlertCircle,
  BadgeCheck,
  ExternalLink,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Rocket,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import packageMetadata from '../../package.json'
import { api, type SystemUpdateBuild, type SystemVersion } from '../lib/api'
import { errorMessage } from '../lib/errorMessage'
import { t } from '../lib/i18n'

export function VersionStatusCard() {
  const [version, setVersion] = useState<SystemVersion | null>(null)
  const [loading, setLoading] = useState(true)
  const [requestFailed, setRequestFailed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateBuild, setUpdateBuild] = useState<SystemUpdateBuild | null>(null)
  const [updateError, setUpdateError] = useState('')
  const pollTimer = useRef<number | null>(null)

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

  useEffect(() => () => {
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current)
  }, [])

  const pollUpdate = useCallback((buildId: string) => {
    const poll = async () => {
      try {
        const result = await api.systemUpdateStatus(buildId)
        setUpdateBuild(result.build)
        if (result.build.state === 'succeeded') {
          pollTimer.current = window.setTimeout(() => window.location.reload(), 1_500)
          return
        }
        if (result.build.state === 'failed') {
          setUpdating(false)
          setUpdateError(t('更新构建失败，当前版本没有改变。'))
          return
        }
        pollTimer.current = window.setTimeout(() => void poll(), 3_000)
      } catch (error) {
        setUpdating(false)
        setUpdateError(errorMessage(error))
      }
    }
    void poll()
  }, [])

  const startUpdate = async () => {
    if (!version?.latestVersion) return
    setConfirming(false)
    setUpdating(true)
    setUpdateError('')
    try {
      const result = await api.startSystemUpdate(version.latestVersion)
      setUpdateBuild(result.build)
      pollUpdate(result.build.id)
    } catch (error) {
      setUpdating(false)
      setUpdateError(errorMessage(error))
    }
  }

  const currentVersion = version?.currentVersion || packageMetadata.version
  const checkFailed = requestFailed || Boolean(version?.checkFailed)
  const hasUpdate = Boolean(version?.updateAvailable && version.latestVersion)
  const status = updateBuild?.state === 'succeeded'
    ? <><BadgeCheck size={15} />{t('更新已部署，正在重新加载…')}</>
    : updating
      ? <><LoaderCircle className="spin" size={15} />{t(updateBuild?.state === 'running'
        ? '正在构建并部署…'
        : '更新任务正在排队…')}</>
      : loading
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
          disabled={loading || updating}
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
            {version.automaticUpdate && (
              <button
                className="button button--primary button--small"
                type="button"
                disabled={updating}
                onClick={() => setConfirming(true)}
              >
                {updating ? <LoaderCircle className="spin" size={14} /> : <Rocket size={14} />}
                {t(updating ? '正在更新…' : '更新到 v{version}', {
                  version: version.latestVersion || '',
                })}
              </button>
            )}
            <a
              className="button button--secondary button--small"
              href={version.releaseUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t(version.automaticUpdate ? '查看发布说明' : '查看更新')}<ExternalLink size={14} />
            </a>
          </div>
          {!version.automaticUpdate && (
            <p className="admin-note version-update-note">
              {t(version.automaticUpdateReason === 'super_admin_required'
                ? '只有主管理员可以安装更新；当前账户仍可查看发布说明。'
                : '当前部署未配置自动更新，可按发布说明手动更新。')}
            </p>
          )}
        </>
      ) : (
        <p className="admin-note">
          {t('打开系统设置时会自动检查；结果最多缓存一小时，更新不会自动安装。')}
        </p>
      )}
      {confirming && version?.latestVersion && (
        <div className="version-update-confirm" role="alertdialog" aria-label={t('确认系统更新')}>
          <strong>{t('确认更新到 v{version}？', { version: version.latestVersion })}</strong>
          <p>{t('系统将构建 Release Tag 对应的确切提交；部署完成后页面会自动重新加载。')}</p>
          <div>
            <button className="button button--secondary button--small" type="button" onClick={() => setConfirming(false)}>{t('取消')}</button>
            <button className="button button--primary button--small" type="button" onClick={() => void startUpdate()}><Rocket size={14} />{t('开始更新')}</button>
          </div>
        </div>
      )}
      {updateError && <p className="inline-error version-update-error" role="alert"><AlertCircle size={15} />{updateError}</p>}
    </section>
  )
}
