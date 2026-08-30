import { Check, Copy, SquareTerminal } from 'lucide-react'
import { t } from '../../../shared/i18n'

export type ApiCopyState = { key: string; status: 'copied' | 'failed' } | null

export function ApiCopyButton({
  copyKey,
  value,
  state,
  onCopy,
}: {
  copyKey: string
  value: string
  state: ApiCopyState
  onCopy: (key: string, value: string) => Promise<void>
}) {
  const copied = state?.key === copyKey && state.status === 'copied'
  return (
    <button
      className="api-copy-button"
      type="button"
      onClick={() => void onCopy(copyKey, value)}
    >
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {t(copied ? '已复制' : '复制')}
    </button>
  )
}

export function ApiCodeBlock({
  copyKey,
  title,
  code,
  state,
  onCopy,
}: {
  copyKey: string
  title: string
  code: string
  state: ApiCopyState
  onCopy: (key: string, value: string) => Promise<void>
}) {
  return (
    <div className="api-code-block">
      <header>
        <span><SquareTerminal size={15} aria-hidden="true" />{title}</span>
        <ApiCopyButton copyKey={copyKey} value={code} state={state} onCopy={onCopy} />
      </header>
      <pre><code>{code}</code></pre>
    </div>
  )
}
