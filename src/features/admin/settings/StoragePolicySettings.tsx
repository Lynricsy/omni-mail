import {
  AlertCircle,
  Archive,
  CheckCircle2,
  DatabaseBackup,
  FilePenLine,
  HardDrive,
  LoaderCircle,
  Play,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type StoragePolicy } from '../../../shared/api'
import { getLocale, t } from '../../../shared/i18n'
import { BackupBrowser } from '../backups/BackupBrowser'

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp * 1000))
}

function errorMessage(error: unknown): string {
  return t(error instanceof Error ? error.message : '无法更新备份与存储策略。')
}

export function StoragePolicySettings({ canBrowseBackups }: { canBrowseBackups: boolean }) {
  const [policy, setPolicy] = useState<StoragePolicy | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const result = await api.storagePolicy()
      setPolicy(result.storagePolicy)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function save(nextPolicy = policy) {
    if (!nextPolicy) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await api.updateStoragePolicy({
        backupEnabled: nextPolicy.backupEnabled,
        trashRetentionDays: nextPolicy.trashRetentionDays,
        temporaryDataRetentionDays: nextPolicy.temporaryDataRetentionDays,
        auditRetentionDays: nextPolicy.auditRetentionDays,
        failedMessageRetentionDays: nextPolicy.failedMessageRetentionDays,
        defaultUserQuotaMiB: nextPolicy.defaultUserQuotaMiB,
        defaultTemporaryQuotaMiB: nextPolicy.defaultTemporaryQuotaMiB,
        draftLimits: nextPolicy.draftLimits,
      })
      setPolicy(result.storagePolicy)
      setNotice(t('备份与存储策略已保存。'))
    } catch (saveError) {
      setError(errorMessage(saveError))
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function toggleBackup() {
    if (!policy) return
    const next = { ...policy, backupEnabled: !policy.backupEnabled }
    setPolicy(next)
    await save(next)
  }

  async function startBackup() {
    setStarting(true)
    setError('')
    setNotice('')
    try {
      await api.startBackup()
      setNotice(t('备份任务已提交，可稍后刷新查看结果。'))
    } catch (startError) {
      setError(errorMessage(startError))
    } finally {
      setStarting(false)
    }
  }

  function update<K extends keyof StoragePolicy>(key: K, value: StoragePolicy[K]) {
    setPolicy((current) => current ? { ...current, [key]: value } : current)
    setNotice('')
  }

  function updateDraftLimit(key: keyof StoragePolicy['draftLimits'], value: number) {
    setPolicy((current) => current ? {
      ...current,
      draftLimits: { ...current.draftLimits, [key]: value },
    } : current)
    setNotice('')
  }

  return (
    <section className="admin-card admin-card--settings storage-policy-card">
      <header>
        <DatabaseBackup size={17} />
        <div>
          <h2>{t('备份、保留与配额')}</h2>
          <p>{t('由管理员决定是否备份，并控制自动清理和用户空间')}</p>
        </div>
        <button
          className="icon-button storage-policy-refresh"
          type="button"
          aria-label={t('刷新备份状态')}
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={loading ? 'spin' : ''} size={16} />
        </button>
      </header>

      {loading && !policy ? (
        <div className="storage-policy-loading" role="status">
          <LoaderCircle className="spin" size={18} />
          {t('正在读取存储策略…')}
        </div>
      ) : policy && (
        <>
          <div className="storage-policy-layout" aria-busy={saving || starting}>
            <div className="storage-policy-backup">
              <label className="policy-toggle">
                <span>
                  <DatabaseBackup size={17} />
                  <span>
                    <strong>{t(policy.backupEnabled ? '自动备份已开启' : '自动备份已关闭')}</strong>
                    <small>{t('每日导出 D1，并归档邮件原文到独立 R2 存储桶')}</small>
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={policy.backupEnabled}
                  disabled={saving || (!policy.backupReady && !policy.backupEnabled)}
                  aria-label={t('开启自动备份')}
                  onChange={() => void toggleBackup()}
                />
              </label>

              <div className={`backup-readiness ${policy.backupReady ? 'is-ready' : 'is-missing'}`}>
                {policy.backupReady
                  ? <CheckCircle2 size={16} />
                  : <AlertCircle size={16} />}
                <span>
                  <strong>{t(policy.backupReady ? '备份资源已就绪' : '备份资源尚未就绪')}</strong>
                  <small>
                    {policy.backupReady
                      ? t('管理员可以开启备份或立即执行一次备份。')
                      : t('缺少：{items}', { items: policy.backupMissing.join('、') })}
                  </small>
                </span>
              </div>

              <div className="backup-retention">
                <span><Archive size={15} />{t('数据库：每日 {daily} 天 / 每周 {weekly} 天 / 每月 {monthly} 天', {
                  daily: policy.backupRetention.dailyDays,
                  weekly: policy.backupRetention.weeklyDays,
                  monthly: policy.backupRetention.monthlyDays,
                })}</span>
                <span><HardDrive size={15} />{t('邮件归档保留 {days} 天', {
                  days: policy.backupRetention.mailDays,
                })}</span>
              </div>

              <div className="backup-actions">
                <button
                  className="button button--secondary button--small"
                  type="button"
                  disabled={starting || saving || !policy.backupEnabled || !policy.backupReady}
                  onClick={() => void startBackup()}
                >
                  {starting
                    ? <LoaderCircle className="spin" size={14} />
                    : <Play size={14} />}
                  {t(starting ? '正在提交…' : '立即备份')}
                </button>
                {policy.lastBackup ? (
                  <span className={`last-backup is-${policy.lastBackup.status}`}>
                    {t(policy.lastBackup.status === 'succeeded'
                      ? '上次备份成功'
                      : policy.lastBackup.status === 'running'
                        ? '备份正在运行'
                        : '上次备份失败')}
                    {' · '}
                    {formatDate(policy.lastBackup.startedAt)}
                  </span>
                ) : <span className="last-backup">{t('尚无备份记录')}</span>}
              </div>
              {policy.lastBackup?.error && (
                <p className="backup-error" role="alert">{policy.lastBackup.error}</p>
              )}
            </div>

            <div className="storage-policy-fields">
              <label>
                <span><Trash2 size={14} />{t('垃圾箱保留')}</span>
                <span><input type="number" min={1} max={90} value={policy.trashRetentionDays}
                  onChange={(event) => update('trashRetentionDays', Number(event.target.value))} />{t('天')}</span>
              </label>
              <label>
                <span>{t('已注销账号数据保留')}</span>
                <span><input type="number" min={1} max={90} value={policy.temporaryDataRetentionDays}
                  onChange={(event) => update('temporaryDataRetentionDays', Number(event.target.value))} />{t('天')}</span>
              </label>
              <label>
                <span>{t('失败邮件保留')}</span>
                <span><input type="number" min={1} max={30} value={policy.failedMessageRetentionDays}
                  onChange={(event) => update('failedMessageRetentionDays', Number(event.target.value))} />{t('天')}</span>
              </label>
              <label>
                <span>{t('操作日志保留')}</span>
                <span><input type="number" min={30} max={3650} value={policy.auditRetentionDays}
                  onChange={(event) => update('auditRetentionDays', Number(event.target.value))} />{t('天')}</span>
              </label>
              <label>
                <span>{t('普通用户默认配额')}</span>
                <span><input type="number" min={64} max={102400} value={policy.defaultUserQuotaMiB}
                  onChange={(event) => update('defaultUserQuotaMiB', Number(event.target.value))} />MiB</span>
              </label>
              <label>
                <span>{t('临时用户默认配额')}</span>
                <span><input type="number" min={16} max={10240} value={policy.defaultTemporaryQuotaMiB}
                  onChange={(event) => update('defaultTemporaryQuotaMiB', Number(event.target.value))} />MiB</span>
              </label>
              <div className="storage-policy-section-heading">
                <FilePenLine size={15} />
                <span><strong>{t('草稿保存量')}</strong><small>{t('每个账户最近保留的草稿数量')}</small></span>
              </div>
              <label>
                <span>{t('主管理员')}</span>
                <span><input type="number" min={1} max={20} value={policy.draftLimits.superAdmin}
                  onChange={(event) => updateDraftLimit('superAdmin', Number(event.target.value))} />{t('封')}</span>
              </label>
              <label>
                <span>{t('管理员')}</span>
                <span><input type="number" min={1} max={20} value={policy.draftLimits.admin}
                  onChange={(event) => updateDraftLimit('admin', Number(event.target.value))} />{t('封')}</span>
              </label>
              <label>
                <span>{t('普通用户')}</span>
                <span><input type="number" min={1} max={20} value={policy.draftLimits.user}
                  onChange={(event) => updateDraftLimit('user', Number(event.target.value))} />{t('封')}</span>
              </label>
              <label>
                <span>{t('临时用户')}</span>
                <span><input type="number" min={1} max={20} value={policy.draftLimits.temporary}
                  onChange={(event) => updateDraftLimit('temporary', Number(event.target.value))} />{t('封')}</span>
              </label>
            </div>
          </div>

          {canBrowseBackups && <BackupBrowser enabled={policy.backupReady} />}

          <footer className="storage-policy-footer">
            <small>{t('草稿上限保存后立即生效；超出部分会从最早的草稿开始清理。')}</small>
            <button
              className="button button--primary button--small"
              type="button"
              disabled={saving || starting}
              onClick={() => void save()}
            >
              {saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}
              {t(saving ? '保存中…' : '保存策略')}
            </button>
          </footer>
        </>
      )}
      {notice && <p className="inline-success" role="status"><CheckCircle2 size={15} />{notice}</p>}
      {error && <p className="inline-error" role="alert"><AlertCircle size={15} />{error}</p>}
    </section>
  )
}
