import { useRef, type KeyboardEvent } from 'react'
import { t, useLocale } from '../../src/shared/i18n'
import type { MailSourceDescriptor, MailSourceId } from './mail-source'

const sourceMarks: Record<MailSourceId, string> = {
  omnimail: 'OM',
  icloud: 'iC',
  linuxdo: 'DO',
  gmail: 'G',
  microsoft: 'MS',
  qq: 'QQ',
  naver: 'N',
  yandex: 'Y',
}

const sourceLabels: Record<MailSourceId, string> = {
  omnimail: 'Omni',
  icloud: 'iCloud',
  linuxdo: 'Linux DO',
  gmail: 'Gmail',
  microsoft: 'Microsoft',
  qq: 'QQ',
  naver: 'NAVER',
  yandex: 'Yandex',
}

export function PanelInboxSourceNav({ sources, value, onChange }: {
  sources: MailSourceDescriptor[]
  value: MailSourceId | null
  onChange: (source: MailSourceId) => void
}) {
  useLocale()
  const root = useRef<HTMLDivElement>(null)

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>('button')
    if (!buttons?.length) return
    let next = index
    if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
    else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = buttons.length - 1
    else return
    event.preventDefault()
    buttons[next].focus()
  }

  return <div ref={root} className="panel-source-nav" role="navigation"
    aria-label={t('邮箱来源导航')}>
    {sources.map((source, index) => {
      const selected = source.id === value
      const label = sourceLabels[source.id]
      return <button type="button" className={selected ? 'is-active' : ''}
        aria-current={selected ? 'page' : undefined}
        aria-label={t('切换到 {source} 收件箱', { source: source.label })}
        title={source.label} key={source.id}
        onKeyDown={(event) => moveFocus(event, index)}
        onClick={() => onChange(source.id)}>
        <span className="panel-source-mark" aria-hidden="true">{sourceMarks[source.id]}</span>
        <span>{label}</span>
      </button>
    })}
  </div>
}
