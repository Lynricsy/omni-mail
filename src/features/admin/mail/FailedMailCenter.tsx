import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  HardDrive,
  LoaderCircle,
  Mail,
  RefreshCw,
  RotateCw,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { type FailedMail, failedMailApi } from '../../messages/api/failedMailApi'
import { getLocale, t } from '../../../shared/i18n'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB']
  let value = bytes / 1024
  let unit = units[0]
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024
    unit = units[index]
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function errorMessage(error: unknown): string {
  return t(error instanceof Error ? error.message : '无法读取失败邮件。')
}

export function FailedMailCenter({ onChanged }: { onChanged: () => void }) {
  const [messages, setMessages] = useState<FailedMail[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [retryingId, setRetryingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    failedMailApi.list()
      .then((result) => {
        if (!active) return
        setMessages(result.messages)
        setTotal(result.total)
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [reloadKey])

  async function retry(message: FailedMail) {
    setRetryingId(message.id)
    setError('')
    setNotice('')
    try {
      await failedMailApi.retry(message.id)
      setNotice(t('“{subject}”已重新提交处理。', { subject: message.subject }))
      setReloadKey((value) => value + 1)
      onChanged()
    } catch (retryError) {
      setError(errorMessage(retryError))
    } finally {
      setRetryingId('')
    }
  }

  return (
    <section className="admin-card failed-mail-card">
      <header>
        <AlertCircle size={17} />
        <div>
          <h2>{t('失败邮件恢复中心')}</h2>
          <p>{t('查看解析失败原因，并从私有原始邮件重新提交处理')}</p>
        </div>
        <button className="icon-button icon-button--small" type="button"
          aria-label={t('刷新失败邮件')} data-tooltip={t('刷新失败邮件')}
          disabled={loading} onClick={() => setReloadKey((value) => value + 1)}>
          <RefreshCw className={loading ? 'spin' : ''} size={15} />
        </button>
      </header>

      <div className="failed-mail-summary">
        <span><AlertCircle size={15} />{t('当前失败')}</span>
        <strong>{total}</strong>
        <small>{t('最多显示最近 50 封')}</small>
      </div>

      {loading && !messages.length ? (
        <div className="failed-mail-state" role="status">
          <LoaderCircle className="spin" size={18} />{t('正在读取失败邮件…')}
        </div>
      ) : messages.length ? (
        <div className="failed-mail-list">
          {messages.map((message) => (
            <article key={message.id}>
              <div className="failed-mail-main">
                <span><strong>{message.subject}</strong><small>
                  {message.senderName || message.senderAddress}
                  {message.senderName ? ` · ${message.senderAddress}` : ''}
                </small></span>
                <code>{message.error}</code>
              </div>
              <div className="failed-mail-meta">
                <span><Mail size={13} />{message.mailboxAddress}</span>
                <span><Clock3 size={13} />{formatDate(message.lastFailedAt)}</span>
                <span><RotateCw size={13} />{t('{count} 次尝试', { count: message.attempts })}</span>
                <span><HardDrive size={13} />{formatBytes(message.size)}</span>
              </div>
              <button className="button button--secondary button--small" type="button"
                disabled={!message.canRetry || Boolean(retryingId)}
                onClick={() => void retry(message)}>
                {retryingId === message.id
                  ? <LoaderCircle className="spin" size={14} />
                  : <RotateCw size={14} />}
                {t(message.canRetry ? '重新处理' : '原始邮件缺失')}
              </button>
            </article>
          ))}
        </div>
      ) : !error && (
        <div className="failed-mail-state is-empty">
          <CheckCircle2 size={19} />
          <span><strong>{t('当前没有失败邮件')}</strong><small>{t('自动重试耗尽后，邮件会出现在这里。')}</small></span>
        </div>
      )}

      {notice && <p className="failed-mail-feedback is-success" role="status" aria-live="polite">
        <CheckCircle2 size={15} />{notice}
      </p>}
      {error && <p className="failed-mail-feedback is-error" role="alert">
        <AlertCircle size={15} />{error}
      </p>}
    </section>
  )
}
