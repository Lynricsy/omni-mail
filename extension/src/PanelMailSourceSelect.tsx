import type { MailSourceDescriptor, MailSourceId } from './mail-source'
import { PanelSelect } from './PanelSelect'

export function PanelMailSourceSelect({ id, source, sources, onChange }: {
  id: string
  source: MailSourceId
  sources: MailSourceDescriptor[]
  onChange: (source: MailSourceId) => void
}) {
  if (sources.length < 2) return null
  return (
    <div className="mail-source-select">
      <span>邮箱来源</span>
      <PanelSelect id={id} ariaLabel="邮箱来源" value={source}
        options={sources.map((item) => ({ label: item.label, value: item.id }))}
        onChange={(value) => onChange(value as MailSourceId)} />
    </div>
  )
}
