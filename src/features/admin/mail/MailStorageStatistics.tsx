import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Check,
  ChevronDown,
  Cloud,
  Database,
  HardDrive,
  LoaderCircle,
  Mail,
  Paperclip,
  Search,
  Trash2,
  UserRound,
  Workflow,
} from 'lucide-react'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import {
  api,
  type MailCleanupFilter,
  type MailCleanupPreview,
  type MailStatistics,
} from '../../../shared/api'
import { getLocale, t } from '../../../shared/i18n'
import { roleLabel } from '../../../shared/auth/roles'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes / 1024
  let unit = units[0]
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024
    unit = units[index]
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`
}

function formatCutoff(timestamp: number): string {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' })
    .format(new Date(timestamp * 1000))
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat(getLocale(), {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function errorMessage(error: unknown): string {
  return t(error instanceof Error ? error.message : '邮件清理操作失败。')
}

type PreviewState = {
  filter: MailCleanupFilter
  preview: MailCleanupPreview
  batchLimit: number
}

const initialFilter: MailCleanupFilter = {
  scope: 'mailbox',
  scopeValue: '',
  category: 'trash',
  olderThanDays: 30,
}

function CleanupSelect({
  value,
  label,
  options,
  onChange,
}: {
  value: string
  label: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const selected = options.find((option) => option.value === value) || options[0]

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [open])

  return (
    <div className={`cleanup-select ${open ? 'is-open' : ''}`} ref={root}>
      <button
        className="cleanup-select__trigger"
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="cleanup-select__menu" id={menuId} role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              className={option.value === value ? 'is-selected' : ''}
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function UsageLists({ storage }: { storage: MailStatistics['storage'] }) {
  return (
    <div className="storage-ranking-grid">
      <section>
        <h3><UserRound size={15} />{t('用户存储用量')}</h3>
        <div className="storage-ranking-list">
          {storage.byUser.map((user) => {
            const percent = user.quotaBytes > 0
              ? Math.min(100, user.usedBytes / user.quotaBytes * 100)
              : 0
            return (
              <div key={user.id}>
                <span><strong>{user.displayName}</strong><small>{user.email} · {roleLabel(user.role)}</small></span>
                <span><b>{formatBytes(user.usedBytes)}</b><small>{user.messageCount} {t('封邮件')}</small></span>
                {user.quotaBytes > 0 && (
                  <i aria-label={t('用户存储使用率')} role="meter" aria-valuemin={0}
                    aria-valuemax={100} aria-valuenow={Math.round(percent)}>
                    <i style={{ width: `${percent}%` }} />
                  </i>
                )}
              </div>
            )
          })}
          {!storage.byUser.length && <p>{t('暂无用户存储数据。')}</p>}
        </div>
      </section>
      <section>
        <h3><Mail size={15} />{t('邮箱存储用量')}</h3>
        <div className="storage-ranking-list storage-mailbox-ranking">
          {storage.byMailbox.map((mailbox) => (
            <div key={mailbox.address}>
              <span><strong>{mailbox.address}</strong><small>{mailbox.userEmail}</small></span>
              <span><b>{formatBytes(mailbox.usedBytes)}</b><small>{mailbox.messageCount} {t('封邮件')}</small></span>
            </div>
          ))}
          {!storage.byMailbox.length && <p>{t('暂无邮箱存储数据。')}</p>}
        </div>
      </section>
    </div>
  )
}

function PlatformUsagePanel({ usage }: { usage: MailStatistics['platform'] }) {
  const metrics = [
    {
      label: t('Worker 轮询请求'),
      detail: t('单个持续可见页面 / 天'),
      used: usage.workerRequests.estimatedPerVisibleTab,
      limit: usage.workerRequests.dailyLimit,
      Icon: Activity,
    },
    {
      label: t('D1 轮询读取'),
      detail: t('单个持续可见页面 / 天'),
      used: usage.d1RowsRead.estimatedPerVisibleTab,
      limit: usage.d1RowsRead.dailyLimit,
      Icon: Database,
    },
    {
      label: t('Queue 操作'),
      detail: t('根据今日收件与失败重试估算'),
      used: usage.queueOperations.estimatedToday,
      limit: usage.queueOperations.dailyLimit,
      Icon: Workflow,
    },
    {
      label: t('R2 主邮件存储'),
      detail: t('不包含备份桶与对象元数据'),
      used: usage.r2Storage.estimatedPrimaryBytes,
      limit: usage.r2Storage.freeBytes,
      Icon: Cloud,
      bytes: true,
    },
  ]

  return (
    <section className="admin-card platform-usage-card">
      <header>
        <Activity size={17} />
        <div>
          <h2>{t('Cloudflare 免费额度参考')}</h2>
          <p>{t('根据当前数据和刷新配置估算，不是 Cloudflare 账单')}</p>
        </div>
      </header>
      <div className="platform-usage-grid">
        {metrics.map(({ label, detail, used, limit, Icon, bytes }) => {
          const percent = limit > 0 ? Math.min(100, used / limit * 100) : 0
          const level = percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : 'normal'
          return (
            <article data-level={level} key={label}>
              <div><Icon size={17} /><span>{label}</span><b>{t(
                level === 'danger' ? '接近上限' : level === 'warning' ? '注意' : '额度正常',
              )}</b></div>
              <strong>{bytes ? formatBytes(used) : formatCompact(used)}</strong>
              <small>/ {bytes ? formatBytes(limit) : formatCompact(limit)} · {detail}</small>
              <i role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={Math.round(percent)}><i style={{ width: `${percent}%` }} /></i>
            </article>
          )
        })}
      </div>
      <p className="platform-usage-note">
        {t('轮询采用自适应退避，实际请求通常低于这里显示的配置上限；其他 API、备份和 Cloudflare 账户内其他 Worker 未计入。')}
      </p>
    </section>
  )
}

function MailCleanup({
  data,
  onCleanupComplete,
}: {
  data: MailStatistics
  onCleanupComplete: () => void
}) {
  const listId = useId()
  const [filter, setFilter] = useState(initialFilter)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function updateFilter(next: Partial<MailCleanupFilter>) {
    setFilter((current) => ({ ...current, ...next }))
    setPreview(null)
    setConfirmed(false)
    setError('')
    setNotice('')
  }

  async function loadPreview(event: FormEvent) {
    event.preventDefault()
    setPreviewing(true)
    setError('')
    setNotice('')
    setConfirmed(false)
    try {
      const result = await api.previewMailCleanup(filter)
      setFilter(result.filter)
      setPreview(result)
    } catch (previewError) {
      setPreview(null)
      setError(errorMessage(previewError))
    } finally {
      setPreviewing(false)
    }
  }

  async function clean() {
    if (!preview || !confirmed || preview.preview.messageCount < 1) return
    setCleaning(true)
    setError('')
    setNotice('')
    try {
      const result = await api.runMailCleanup(
        preview.filter,
        preview.preview.messageCount,
      )
      setNotice(t(
        result.remainingCount
          ? '已永久删除 {count} 封邮件并释放 {bytes}，仍有 {remaining} 封可继续清理。'
          : '已永久删除 {count} 封邮件并释放 {bytes}。',
        {
          count: result.deletedCount,
          bytes: formatBytes(result.deletedBytes),
          remaining: result.remainingCount,
        },
      ))
      setPreview(null)
      setConfirmed(false)
      onCleanupComplete()
    } catch (cleanupError) {
      setError(errorMessage(cleanupError))
      setPreview(null)
      setConfirmed(false)
      onCleanupComplete()
    } finally {
      setCleaning(false)
    }
  }

  const suggestions = filter.scope === 'user'
    ? data.storage.byUser.map((user) => user.email)
    : data.storage.byMailbox.map((mailbox) => mailbox.address)
  const scopeReady = filter.scope === 'all' || filter.scopeValue.trim().includes('@')

  return (
    <section className="admin-card mail-cleanup-card">
      <header>
        <Trash2 size={17} />
        <div>
          <h2>{t('管理员邮件清理')}</h2>
          <p>{t('先预估影响，再分批永久删除主邮件存储中的数据')}</p>
        </div>
      </header>
      <form className="mail-cleanup-form" onSubmit={(event) => void loadPreview(event)}>
        <label>
          <span>{t('清理范围')}</span>
          <CleanupSelect
            label={t('清理范围')}
            value={filter.scope}
            options={[
              { value: 'mailbox', label: t('指定邮箱') },
              { value: 'user', label: t('指定用户') },
              { value: 'all', label: t('全站邮件') },
            ]}
            onChange={(value) => updateFilter({
              scope: value as MailCleanupFilter['scope'],
              scopeValue: '',
            })}
          />
        </label>
        {filter.scope !== 'all' && (
          <label>
            <span>{t(filter.scope === 'user' ? '用户登录邮箱' : '邮箱地址')}</span>
            <input
              type="email"
              list={listId}
              value={filter.scopeValue}
              placeholder={filter.scope === 'user' ? 'user@example.com' : 'inbox@example.com'}
              onChange={(event) => updateFilter({ scopeValue: event.target.value })}
              required
            />
            <datalist id={listId}>
              {suggestions.map((value) => <option value={value} key={value} />)}
            </datalist>
          </label>
        )}
        <label>
          <span>{t('邮件类型')}</span>
          <CleanupSelect
            label={t('邮件类型')}
            value={filter.category}
            options={[
              { value: 'trash', label: t('垃圾箱邮件') },
              { value: 'failed', label: t('处理失败邮件') },
              { value: 'incoming', label: t('全部收件') },
              { value: 'sent', label: t('全部已发送') },
              { value: 'all', label: t('所有类型') },
            ]}
            onChange={(value) => updateFilter({
              category: value as MailCleanupFilter['category'],
            })}
          />
        </label>
        <label>
          <span>{t('邮件时间早于')}</span>
          <CleanupSelect
            label={t('邮件时间早于')}
            value={String(filter.olderThanDays)}
            options={[1, 7, 30, 90, 180, 365].map((days) => ({
              value: String(days),
              label: t('{days} 天', { days }),
            }))}
            onChange={(value) => updateFilter({ olderThanDays: Number(value) })}
          />
        </label>
        <button className="button button--secondary button--small" type="submit"
          disabled={previewing || cleaning || !scopeReady}>
          {previewing ? <LoaderCircle className="spin" size={14} /> : <Search size={14} />}
          {t(previewing ? '正在预估…' : '预估影响')}
        </button>
      </form>

      {filter.scope === 'all' && (
        <p className="cleanup-scope-warning"><AlertCircle size={15} />{t('当前选择会匹配全站邮件，请仔细核对类型和时间。')}</p>
      )}
      {preview && (
        <div className="cleanup-preview">
          <div>
            <strong>{t('将匹配 {count} 封邮件', { count: preview.preview.messageCount })}</strong>
            <span>
              {formatBytes(preview.preview.bytes)} · {preview.preview.attachmentCount} {t('个附件')}
              {' · '}{t('{date} 及以前', { date: formatCutoff(preview.preview.cutoff) })}
            </span>
          </div>
          {preview.preview.messageCount > 0 ? (
            <>
              <label className="cleanup-confirm">
                <input type="checkbox" checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)} />
                <span>{t('我确认永久删除这些邮件；此操作无法撤销。')}</span>
              </label>
              <button className="button cleanup-delete-button" type="button"
                disabled={!confirmed || cleaning} onClick={() => void clean()}>
                {cleaning ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
                {t(
                  preview.preview.messageCount > preview.batchLimit
                    ? '永久清理前 {count} 封'
                    : '永久清理 {count} 封',
                  { count: Math.min(preview.preview.messageCount, preview.batchLimit) },
                )}
              </button>
            </>
          ) : <small>{t('当前条件没有可清理的邮件。')}</small>}
        </div>
      )}
      <p className="cleanup-note">
        <Database size={14} />
        {t('每次最多清理 50 封；正在处理的邮件不会被删除，备份桶中的保留副本不受影响。')}
      </p>
      {notice && <p className="cleanup-feedback is-success" role="status"><CheckCircle2 size={15} />{notice}</p>}
      {error && <p className="cleanup-feedback is-error" role="alert"><AlertCircle size={15} />{error}</p>}
    </section>
  )
}

export function MailStorageStatistics({
  data,
  onCleanupComplete,
}: {
  data: MailStatistics
  onCleanupComplete: () => void
}) {
  const storage = data.storage
  const quotaPercent = storage.quotaBytes > 0
    ? Math.min(100, storage.quotaUsedBytes / storage.quotaBytes * 100)
    : 0
  return (
    <>
      <section className="admin-card storage-statistics-card">
        <header>
          <HardDrive size={17} />
          <div><h2>{t('当前存储用量')}</h2><p>{t('按用户配额口径统计邮件原文与已发送正文')}</p></div>
        </header>
        <div className="storage-metric-grid">
          <div><HardDrive size={17} /><span><strong>{formatBytes(storage.usedBytes)}</strong><small>{t('邮件计量用量')}</small></span></div>
          <div><Mail size={17} /><span><strong>{storage.messageCount}</strong><small>{t('当前邮件')}</small></span></div>
          <div><Paperclip size={17} /><span><strong>{storage.attachmentCount}</strong><small>{formatBytes(storage.attachmentBytes)} {t('附件')}</small></span></div>
          <div><Trash2 size={17} /><span><strong>{storage.trashCount}</strong><small>{formatBytes(storage.trashBytes)} {t('垃圾箱')}</small></span></div>
        </div>
        {storage.quotaBytes > 0 && (
          <div className="storage-total-progress">
            <span><strong>{t('已配置配额使用率')}</strong><b>{quotaPercent.toFixed(1)}%</b></span>
            <i role="meter" aria-label={t('全站已配置配额使用率')} aria-valuemin={0}
              aria-valuemax={100} aria-valuenow={Math.round(quotaPercent)}>
              <i style={{ width: `${quotaPercent}%` }} />
            </i>
            <small>
              {formatBytes(storage.quotaUsedBytes)} / {formatBytes(storage.quotaBytes)}
              {storage.unlimitedUsers > 0
                ? ` · ${t('{count} 个不限额用户', { count: storage.unlimitedUsers })}`
                : ''}
            </small>
          </div>
        )}
        <UsageLists storage={storage} />
      </section>
      <PlatformUsagePanel usage={data.platform} />
      <MailCleanup data={data} onCleanupComplete={onCleanupComplete} />
    </>
  )
}
