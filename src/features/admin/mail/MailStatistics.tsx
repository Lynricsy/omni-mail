import {
  AlertCircle,
  AtSign,
  CalendarDays,
  Clock3,
  Globe2,
  Inbox,
  LoaderCircle,
  TrendingUp,
  Users,
} from 'lucide-react'
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { api, type MailStatistics as StatisticsData } from '../../../shared/api'
import { getLocale, t } from '../../../shared/i18n'
import { MailStorageStatistics } from './MailStorageStatistics'
import { FailedMailCenter } from './FailedMailCenter'

type RangeDays = StatisticsData['days']

function errorMessage(error: unknown): string {
  return t(error instanceof Error ? error.message : '无法读取邮件统计。')
}

function formatDay(timestamp: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestamp * 1000))
}

function TrendChart({ data }: { data: StatisticsData }) {
  const width = 900
  const height = 260
  const plot = { left: 44, right: 16, top: 18, bottom: 38 }
  const innerWidth = width - plot.left - plot.right
  const innerHeight = height - plot.top - plot.bottom
  const peak = Math.max(...data.daily.map((item) => item.count), 1)
  const points = data.daily.map((item, index) => ({
    ...item,
    x: plot.left + (index / Math.max(1, data.daily.length - 1)) * innerWidth,
    y: plot.top + innerHeight - (item.count / peak) * innerHeight,
  }))
  const line = points.map((point, index) => (
    `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  )).join(' ')
  const area = points.length
    ? `${line} L ${points.at(-1)?.x} ${plot.top + innerHeight} L ${points[0].x} ${plot.top + innerHeight} Z`
    : ''
  const labelIndexes = [...new Set([0, .25, .5, .75, 1].map((part) => (
    Math.round((data.daily.length - 1) * part)
  )))]
  const yTicks = peak === 1 ? [1, 0] : [peak, Math.ceil(peak / 2), 0]

  return (
    <div className="statistics-trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="mail-trend-title mail-trend-desc">
        <title id="mail-trend-title">{t('最近 {days} 天收件趋势', { days: data.days })}</title>
        <desc id="mail-trend-desc">{t('每天收到的邮件数量，最高单日 {peak} 封。', { peak })}</desc>
        {yTicks.map((tick) => {
          const y = plot.top + innerHeight - (tick / peak) * innerHeight
          return (
            <g key={tick}>
              <line className="statistics-grid-line" x1={plot.left} x2={width - plot.right} y1={y} y2={y} />
              <text className="statistics-axis-label" x={plot.left - 10} y={y + 4} textAnchor="end">{tick}</text>
            </g>
          )
        })}
        <path className="statistics-area" d={area} />
        <path className="statistics-line" d={line} />
        {points.map((point) => {
          const label = t('{date}：{count} 封', {
            date: formatDay(point.day),
            count: point.count,
          })
          return <circle className="statistics-point" cx={point.x} cy={point.y} r="4"
            role="img" aria-label={label} data-tooltip={label} tabIndex={0} key={point.day} />
        })}
        {labelIndexes.map((index) => (
          <text
            className="statistics-axis-label"
            x={points[index].x}
            y={height - 10}
            textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            key={points[index].day}
          >
            {formatDay(points[index].day)}
          </text>
        ))}
      </svg>
    </div>
  )
}

function SourceDomains({ data }: { data: StatisticsData }) {
  const largest = Math.max(...data.sourceDomains.map((source) => source.count), 1)
  return (
    <section className="admin-card statistics-source-card">
      <header>
        <Globe2 size={17} />
        <div><h2>{t('来源域名')}</h2><p>{t('近 {days} 天发件域名分布', { days: data.days })}</p></div>
      </header>
      {data.sourceDomains.length ? (
        <div className="statistics-source-list">
          {data.sourceDomains.map((source) => {
            const percent = data.summary.periodReceived
              ? Math.round(source.count / data.summary.periodReceived * 100)
              : 0
            const style = {
              '--source-width': `${source.count / largest * 100}%`,
            } as CSSProperties
            return (
              <div key={source.domain}>
                <span><strong>{source.domain}</strong><small>{percent}%</small><b>{source.count}</b></span>
                <i style={style} aria-hidden="true" />
              </div>
            )
          })}
        </div>
      ) : <p className="admin-empty">{t('这个时间范围内还没有收到邮件。')}</p>}
    </section>
  )
}

function TopSenders({ data }: { data: StatisticsData }) {
  return (
    <section className="admin-card statistics-sender-card">
      <header>
        <AtSign size={17} />
        <div><h2>{t('高频发件人')}</h2><p>{t('近 {days} 天具体发件地址', { days: data.days })}</p></div>
      </header>
      {data.topSenders.length ? (
        <div className="statistics-sender-list">
          {data.topSenders.map((sender, index) => (
            <div key={sender.address}>
              <span>{index + 1}</span>
              <p><strong>{sender.name || sender.address}</strong>{sender.name && <small>{sender.address}</small>}</p>
              <b>{t('{count} 封', { count: sender.count })}</b>
            </div>
          ))}
        </div>
      ) : <p className="admin-empty">{t('这个时间范围内还没有发件人数据。')}</p>}
    </section>
  )
}

export function MailStatistics() {
  const [days, setDays] = useState<RangeDays>(30)
  const [data, setData] = useState<StatisticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.mailStatistics(days)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [days, reloadKey])

  const cards = useMemo(() => data ? [
    { label: t('累计收件'), value: data.summary.totalReceived, Icon: Inbox },
    { label: t('近 {days} 天', { days: data.days }), value: data.summary.periodReceived, Icon: CalendarDays },
    { label: t('今日收件'), value: data.summary.todayReceived, Icon: Clock3 },
    { label: t('独立发件人'), value: data.summary.uniqueSenders, Icon: Users },
  ] : [], [data])

  if (!data && loading) {
    return <div className="statistics-loading" role="status"><LoaderCircle className="spin" size={20} />{t('正在统计全站邮件…')}</div>
  }
  if (!data) {
    return <p className="statistics-error" role="alert"><AlertCircle size={17} />{error}</p>
  }

  return (
    <>
      <div className="statistics-range-row">
        <div><TrendingUp size={16} /><span>{t('统计范围')}</span></div>
        <div className="statistics-range" role="radiogroup" aria-label={t('统计时间范围')}>
          {([7, 30, 90] as const).map((range) => (
            <button
              className={days === range ? 'is-selected' : ''}
              type="button"
              role="radio"
              aria-checked={days === range}
              onClick={() => setDays(range)}
              key={range}
            >
              {t('{days} 天', { days: range })}
            </button>
          ))}
        </div>
        {loading && <LoaderCircle className="spin" size={16} aria-label={t('正在更新统计')} />}
      </div>
      {error && <p className="statistics-error" role="alert"><AlertCircle size={17} />{error}</p>}
      <section className="admin-count-grid statistics-count-grid" aria-label={t('全站收件概况')}>
        {cards.map(({ label, value, Icon }) => (
          <article key={label}><span><Icon size={18} /></span><strong>{value}</strong><small>{label}</small></article>
        ))}
      </section>
      <MailStorageStatistics
        data={data}
        onCleanupComplete={() => setReloadKey((value) => value + 1)}
      />
      <FailedMailCenter onChanged={() => setReloadKey((value) => value + 1)} />
      <section className="admin-card statistics-trend-card">
        <header>
          <TrendingUp size={17} />
          <div><h2>{t('收件趋势')}</h2><p>{t('按 UTC 自然日统计全站收到的邮件')}</p></div>
        </header>
        <TrendChart data={data} />
      </section>
      <div className="statistics-insight-grid">
        <SourceDomains data={data} />
        <TopSenders data={data} />
      </div>
    </>
  )
}
