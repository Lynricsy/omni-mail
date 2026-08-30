import { t } from '../../i18n'

export function ListScrollTopHeading({ title, onScrollTop }: {
  title: string
  onScrollTop: () => void
}) {
  return <h1 aria-label={title}><button className="list-scroll-top-title" type="button"
    onClick={onScrollTop} aria-label={t('回到列表顶部：{title}', { title })}
    data-tooltip={t('回到列表顶部：{title}', { title })}>{title}</button></h1>
}
