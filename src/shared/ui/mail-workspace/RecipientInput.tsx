import { X } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import { t } from '../../i18n'
import {
  isValidRecipient,
  MAX_RECIPIENTS,
  normalizeRecipient,
  recipientList,
} from '../../mail/recipients'

type RecipientState = {
  recipients: string[]
  draft: string
}

function stateFromValue(value: string): RecipientState {
  const values = recipientList(value)
  const firstInvalid = values.findIndex((recipient) => !isValidRecipient(recipient))
  if (firstInvalid < 0) return { recipients: [...new Set(values)], draft: '' }
  return {
    recipients: [...new Set(values.slice(0, firstInvalid))],
    draft: values.slice(firstInvalid).join(', '),
  }
}

export function RecipientInput({ id, value, disabled, autoFocus, onChange }: {
  id: string
  value: string
  disabled: boolean
  autoFocus?: boolean
  onChange: (value: string) => void
}) {
  const initial = stateFromValue(value)
  const [recipients, setRecipients] = useState(initial.recipients)
  const [draft, setDraft] = useState(initial.draft)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const emittedValue = useRef(value)
  const errorId = `${id}-error`

  useEffect(() => {
    if (value === emittedValue.current) return
    const next = stateFromValue(value)
    setRecipients(next.recipients)
    setDraft(next.draft)
    setError('')
    emittedValue.current = value
  }, [value])

  function emit(nextRecipients: string[], nextDraft: string) {
    const nextValue = [...nextRecipients, nextDraft.trim()].filter(Boolean).join(', ')
    emittedValue.current = nextValue
    onChange(nextValue)
  }

  function updateDraft(nextDraft: string) {
    setDraft(nextDraft)
    setError('')
    emit(recipients, nextDraft)
  }

  function addRecipient(valueToAdd = draft): boolean {
    const recipient = normalizeRecipient(valueToAdd)
    if (!recipient) return true
    if (!isValidRecipient(recipient)) {
      setError(t('请输入有效的收件邮箱地址。'))
      return false
    }
    if (recipients.includes(recipient)) {
      setDraft('')
      setError('')
      emit(recipients, '')
      return true
    }
    if (recipients.length >= MAX_RECIPIENTS) {
      setError(t('一封邮件最多添加 {count} 个收件人。', { count: MAX_RECIPIENTS }))
      return false
    }
    const nextRecipients = [...recipients, recipient]
    setRecipients(nextRecipients)
    setDraft('')
    setError('')
    emit(nextRecipients, '')
    return true
  }

  function changeDraft(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    if (!/[;,]/.test(next)) {
      updateDraft(next)
      return
    }
    const parts = next.split(/[;,]/)
    const remainder = parts.pop() || ''
    let nextRecipients = recipients
    for (const part of parts) {
      const recipient = normalizeRecipient(part)
      if (!recipient) continue
      if (!isValidRecipient(recipient)) {
        updateDraft([part, remainder].filter(Boolean).join(', '))
        setError(t('请输入有效的收件邮箱地址。'))
        return
      }
      if (!nextRecipients.includes(recipient)) nextRecipients = [...nextRecipients, recipient]
    }
    if (nextRecipients.length > MAX_RECIPIENTS) {
      setError(t('一封邮件最多添加 {count} 个收件人。', { count: MAX_RECIPIENTS }))
      return
    }
    setRecipients(nextRecipients)
    setDraft(remainder.trimStart())
    setError('')
    emit(nextRecipients, remainder)
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (['Enter', ',', ';'].includes(event.key)) {
      event.preventDefault()
      addRecipient()
    } else if (event.key === 'Tab' && draft.trim()) {
      addRecipient()
    } else if (event.key === 'Backspace' && !draft && recipients.length) {
      const nextRecipients = recipients.slice(0, -1)
      setRecipients(nextRecipients)
      emit(nextRecipients, '')
    }
  }

  function blurInput(event: FocusEvent<HTMLInputElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.parentElement?.contains(next)) return
    addRecipient()
  }

  function removeRecipient(recipient: string) {
    const nextRecipients = recipients.filter((item) => item !== recipient)
    setRecipients(nextRecipients)
    setError('')
    emit(nextRecipients, draft)
    inputRef.current?.focus()
  }

  return <div className="compose-recipient-field">
    <div className="compose-recipient-input" onClick={() => inputRef.current?.focus()}>
      {recipients.map((recipient) => <span className="compose-recipient-chip" key={recipient}>
        <span>{recipient}</span>
        <button type="button" disabled={disabled} onClick={() => removeRecipient(recipient)}
          aria-label={t('移除收件人：{address}', { address: recipient })}>
          <X size={12} aria-hidden="true" />
        </button>
      </span>)}
      <input ref={inputRef} id={id} data-modal-autofocus={autoFocus || undefined}
        type="text" inputMode="email" autoComplete="off" spellCheck={false} autoFocus={autoFocus}
        disabled={disabled} value={draft} maxLength={254} aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        placeholder={recipients.length ? t('继续添加…') : t('输入邮箱后按回车，可添加多个')}
        onChange={changeDraft} onKeyDown={keyDown} onBlur={blurInput} />
    </div>
    {error && <small id={errorId} className="compose-recipient-error" role="alert">{error}</small>}
  </div>
}
