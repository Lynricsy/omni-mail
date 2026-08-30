import { Clock3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getLocale, t } from '../../../shared/i18n'

function remainingLabel(expiresAt: number | null, now: number): string {
  if (!expiresAt) return t('未设置到期时间')
  const remainingMinutes = Math.ceil((expiresAt * 1000 - now) / 60_000)
  if (remainingMinutes <= 0) return t('账号已过期')
  if (remainingMinutes < 60) return t('剩余 {count} 分钟', { count: remainingMinutes })
  const remainingHours = Math.ceil(remainingMinutes / 60)
  if (remainingHours < 24) return t('剩余 {count} 小时', { count: remainingHours })
  const days = Math.floor(remainingHours / 24)
  const hours = remainingHours % 24
  return hours
    ? t('剩余 {days} 天 {hours} 小时', { days, hours })
    : t('剩余 {count} 天', { count: days })
}

function expiryDate(expiresAt: number | null): string {
  if (!expiresAt) return t('未设置到期时间')
  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(expiresAt * 1000))
}

export function TemporaryUserExpiry({ expiresAt }: { expiresAt: number | null }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!expiresAt || expiresAt * 1000 <= now) return
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [expiresAt, now])

  const expired = Boolean(expiresAt && expiresAt * 1000 <= now)
  return (
    <span
      className={`temporary-user-expiry${expired ? ' is-expired' : ''}`}
      data-tooltip={t('到期时间：{date}', { date: expiryDate(expiresAt) })}
    >
      <Clock3 size={12} />
      {remainingLabel(expiresAt, now)}
    </span>
  )
}
