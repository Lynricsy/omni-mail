import { LoaderCircle } from 'lucide-react'
import { t } from '../../../shared/i18n'

export type MicrosoftImportProgressValue = { completed: number; total: number }

export function MicrosoftImportProgress({ progress }: {
  progress: MicrosoftImportProgressValue
}) {
  const current = Math.min(progress.completed + 1, progress.total)
  return <div className="microsoft-import-progress" role="status" aria-live="polite" aria-atomic="true">
    <div><span><LoaderCircle className="spin" size={15} aria-hidden="true" />
      {t('正在逐项验证 Microsoft 账号')}</span>
      <strong>{progress.completed}/{progress.total}</strong></div>
    <progress max={progress.total || 1} value={progress.completed} aria-label={t('验证进度')} />
    <small>{t('正在验证第 {current}/{total} 个账号', {
      current, total: progress.total,
    })}</small>
  </div>
}
