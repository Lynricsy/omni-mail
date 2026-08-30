import {
  CheckCircle2,
  Download,
  FlaskConical,
  LoaderCircle,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, type BackupDrillResult, type BackupObject } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { getLocale, t } from '../../../shared/i18n'

const categories = [
  { value: 'd1/daily/', label: 'D1 每日备份' },
  { value: 'd1/weekly/', label: 'D1 每周备份' },
  { value: 'd1/monthly/', label: 'D1 每月备份' },
  { value: 'mail/raw/', label: '收件归档' },
  { value: 'mail/sent/', label: '发件归档' },
]

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(1)} MiB`
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function localizedDrillDetail(
  check: BackupDrillResult['checks'][number],
  size: number,
): string {
  if (check.label === '对象可读取') {
    return check.passed ? t('对象大小 {size} 字节', { size }) : t('对象为空')
  }
  return t(check.detail)
}

export function BackupBrowser({ enabled }: { enabled: boolean }) {
  const [prefix, setPrefix] = useState(categories[0].value)
  const [objects, setObjects] = useState<BackupObject[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [drilling, setDrilling] = useState('')
  const [drill, setDrill] = useState<BackupDrillResult | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (nextCursor?: string) => {
    if (!enabled) return
    setLoading(true)
    setError('')
    try {
      const result = await api.backupObjects(prefix, nextCursor)
      setObjects((current) => nextCursor ? [...current, ...result.objects] : result.objects)
      setCursor(result.page.nextCursor)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [enabled, prefix])

  useEffect(() => {
    setObjects([])
    setCursor(null)
    setDrill(null)
    void load()
  }, [load])

  async function runDrill(object: BackupObject) {
    setDrilling(object.key)
    setDrill(null)
    setError('')
    try {
      const result = await api.runBackupDrill(object.key)
      setDrill(result.result)
    } catch (drillError) {
      setError(errorMessage(drillError))
    } finally {
      setDrilling('')
    }
  }

  if (!enabled) return null
  return (
    <div className="backup-browser">
      <header>
        <div>
          <strong>{t('备份浏览与恢复演练')}</strong>
          <small>{t('只读验证备份结构，不会导入或覆盖生产数据库。')}</small>
        </div>
        <select value={prefix} onChange={(event) => setPrefix(event.target.value)}
          aria-label={t('备份分类')}>
          {categories.map((category) => (
            <option value={category.value} key={category.value}>{t(category.label)}</option>
          ))}
        </select>
      </header>
      <div className="backup-object-list">
        {objects.map((object) => (
          <article key={object.key}>
            <div>
              <strong>{object.key.split('/').at(-1)}</strong>
              <small>{formatBytes(object.size)} · {formatDate(object.uploadedAt)}</small>
            </div>
            <a className="icon-button" href={api.backupDownloadUrl(object.key)}
              aria-label={t('下载备份')} data-tooltip={t('下载备份')}>
              <Download size={15} />
            </a>
            <button className="button button--secondary button--small" type="button"
              disabled={Boolean(drilling)} onClick={() => void runDrill(object)}>
              {drilling === object.key
                ? <LoaderCircle className="spin" size={14} />
                : <FlaskConical size={14} />}
              {t('演练')}
            </button>
          </article>
        ))}
        {!loading && !objects.length && <p>{t('这个分类中暂无备份对象。')}</p>}
      </div>
      {cursor && (
        <button className="button button--secondary button--small" type="button"
          disabled={loading} onClick={() => void load(cursor)}>
          {loading && <LoaderCircle className="spin" size={14} />}{t('加载更多')}
        </button>
      )}
      {drill && (
        <div className={`backup-drill is-${drill.status}`}>
          <strong>
            {drill.status === 'passed'
              ? <CheckCircle2 size={15} />
              : <XCircle size={15} />}
            {t(drill.status === 'passed' ? '恢复演练通过' : '恢复演练未通过')}
          </strong>
          {drill.checks.map((check) => (
            <span key={check.label}>
              {check.passed ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              {t(check.label)}：{localizedDrillDetail(check, drill.size)}
            </span>
          ))}
        </div>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  )
}
