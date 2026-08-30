import {
  AlertCircle,
  FileImage,
  FileText,
  LoaderCircle,
  Paperclip,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import {
  type ChangeEvent,
  type DragEvent,
  type FocusEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  api,
  type DraftAttachment,
  type MailboxAddress,
  type MailDraft,
} from '../../../shared/api'
import {
  attachmentSelectionError,
  formatAttachmentSize,
  MAX_ATTACHMENTS,
} from '../../../shared/mail/attachmentPolicy'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'
import { recipientValueIsValid } from '../../../shared/mail/recipients'
import { ComposeMailboxSelect } from './ComposeMailboxSelect'
import { RecipientInput } from '../../../shared/ui/mail-workspace/RecipientInput'

export type ComposeDraftFields = Pick<
  MailDraft,
  'mailboxAddress' | 'to' | 'subject' | 'text'
>

export function mergeLoadedDraftFields(
  current: ComposeDraftFields,
  loaded: ComposeDraftFields,
  edited: ReadonlySet<keyof ComposeDraftFields>,
  mailboxes: MailboxAddress[],
): ComposeDraftFields {
  return {
    mailboxAddress: edited.has('mailboxAddress')
      || !mailboxes.some((mailbox) => mailbox.address === loaded.mailboxAddress)
      ? current.mailboxAddress
      : loaded.mailboxAddress,
    to: edited.has('to') ? current.to : loaded.to,
    subject: edited.has('subject') ? current.subject : loaded.subject,
    text: edited.has('text') ? current.text : loaded.text,
  }
}

export function ComposeDialog({
  mailboxes,
  initialMailbox,
  draftId,
  presentation = 'modal',
  onClose,
  onSent,
  onDraftChanged,
}: {
  mailboxes: MailboxAddress[]
  initialMailbox: string
  draftId: string | null
  presentation?: 'modal' | 'inline'
  onClose: () => void
  onSent: () => void
  onDraftChanged: () => void
}) {
  const [draftFields, setDraftFields] = useState<ComposeDraftFields>({
    mailboxAddress: initialMailbox,
    to: '',
    subject: '',
    text: '',
  })
  const { mailboxAddress, to, subject, text } = draftFields
  const [attachments, setAttachments] = useState<DraftAttachment[]>([])
  const [draftLoaded, setDraftLoaded] = useState(!draftId)
  const [draftLoadFailed, setDraftLoadFailed] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [draggingAttachment, setDraggingAttachment] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState('')
  const attachmentInput = useRef<HTMLInputElement>(null)
  const attachmentDragDepth = useRef(0)
  const activeDraftId = useRef<string | null>(draftId)
  const draftVersion = useRef(0)
  const savedDraftVersion = useRef(0)
  const draftSaveQueue = useRef<Promise<void>>(Promise.resolve())
  const editedDraftFields = useRef(new Set<keyof ComposeDraftFields>())
  const finalizing = useRef(false)
  const idempotencyKey = useMemo(
    () => crypto.randomUUID().replaceAll('-', ''),
    [],
  )
  const recipientId = useId()
  const busy = sending || uploading || discarding || closing
  const attachmentBytes = attachments.reduce((total, attachment) => total + attachment.size, 0)
  const attachmentLimitReached = attachments.length >= MAX_ATTACHMENTS
  const inline = presentation === 'inline'

  function updateDraftField<Key extends keyof ComposeDraftFields>(
    field: Key,
    value: ComposeDraftFields[Key],
  ) {
    editedDraftFields.current.add(field)
    draftVersion.current += 1
    setDraftFields((current) => ({ ...current, [field]: value }))
  }

  const saveCurrentDraft = useCallback((force = false) => {
    const input = { mailboxAddress, to, subject, text }
    const version = draftVersion.current
    const request = draftSaveQueue.current.then(async () => {
      if (!activeDraftId.current) {
        if (!force && savedDraftVersion.current >= version) return null
        const result = await api.createDraft(input)
        activeDraftId.current = result.draft.id
        savedDraftVersion.current = Math.max(savedDraftVersion.current, version)
        onDraftChanged()
        return result.draft.id
      }
      if (!force && savedDraftVersion.current >= version) return activeDraftId.current
      await api.saveDraft(activeDraftId.current, input)
      savedDraftVersion.current = Math.max(savedDraftVersion.current, version)
      onDraftChanged()
      return activeDraftId.current
    })
    draftSaveQueue.current = request.then(() => undefined, () => undefined)
    return request
  }, [mailboxAddress, onDraftChanged, subject, text, to])

  useEffect(() => {
    if (!draftId) return
    let active = true
    void api.draft(draftId)
      .then(({ draft }) => {
        if (!active) return
        setDraftFields((current) => mergeLoadedDraftFields(
          current,
          draft,
          editedDraftFields.current,
          mailboxes,
        ))
        setAttachments(draft.attachments)
      })
      .catch((loadError) => {
        if (!active) return
        setDraftLoadFailed(true)
        setError(errorMessage(loadError))
      })
      .finally(() => active && setDraftLoaded(true))
    return () => { active = false }
  }, [draftId, mailboxes])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if (event.key === 'Escape' && !busy && draftLoaded) void closeAndSave()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  })

  useEffect(() => {
    if (!draftLoaded || busy || !mailboxAddress) return
    const timer = window.setTimeout(() => {
      if (finalizing.current) return
      void saveCurrentDraft()
        .catch((saveError) => setError(errorMessage(saveError)))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [busy, draftLoaded, mailboxAddress, saveCurrentDraft])

  async function closeAndSave() {
    if (!draftLoaded) return
    if (draftLoadFailed) {
      onClose()
      return
    }
    finalizing.current = true
    setClosing(true)
    setError('')
    try {
      await saveCurrentDraft()
      onClose()
    } catch (saveError) {
      finalizing.current = false
      setError(errorMessage(saveError))
      setClosing(false)
    }
  }

  async function uploadAttachments(files: File[]) {
    if (!files.length) return
    const validationError = attachmentSelectionError(files, attachments)
    if (validationError) {
      setError(t(validationError))
      return
    }
    setUploading(true)
    setError('')
    try {
      const currentDraftId = await saveCurrentDraft(true)
      if (!currentDraftId) return
      for (const file of files) {
        const result = await api.uploadDraftAttachment(currentDraftId, file)
        setAttachments((current) => [...current, result.attachment])
      }
      onDraftChanged()
    } catch (uploadError) {
      setError(errorMessage(uploadError))
    } finally {
      setUploading(false)
    }
  }

  function addAttachments(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    void uploadAttachments(files)
  }

  function isFileDrag(event: DragEvent<HTMLFormElement>): boolean {
    return Array.from(event.dataTransfer.types).includes('Files')
  }

  function startAttachmentDrag(event: DragEvent<HTMLFormElement>) {
    if (!draftLoaded || busy || !isFileDrag(event)) return
    event.preventDefault()
    attachmentDragDepth.current += 1
    setDraggingAttachment(true)
  }

  function continueAttachmentDrag(event: DragEvent<HTMLFormElement>) {
    if (!draftLoaded || busy || !isFileDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function endAttachmentDrag(event: DragEvent<HTMLFormElement>) {
    if (!attachmentDragDepth.current) return
    event.preventDefault()
    attachmentDragDepth.current = Math.max(0, attachmentDragDepth.current - 1)
    if (!attachmentDragDepth.current) setDraggingAttachment(false)
  }

  function dropAttachments(event: DragEvent<HTMLFormElement>) {
    if (!isFileDrag(event)) return
    event.preventDefault()
    attachmentDragDepth.current = 0
    setDraggingAttachment(false)
    if (!draftLoaded || busy) return
    void uploadAttachments([...event.dataTransfer.files])
  }

  async function removeAttachment(attachment: DraftAttachment) {
    const currentDraftId = activeDraftId.current
    if (!currentDraftId) return
    setUploading(true)
    setError('')
    try {
      await api.deleteDraftAttachment(currentDraftId, attachment.id)
      setAttachments((current) => current.filter((item) => item.id !== attachment.id))
      onDraftChanged()
    } catch (removeError) {
      setError(errorMessage(removeError))
    } finally {
      setUploading(false)
    }
  }

  async function discard() {
    const currentDraftId = activeDraftId.current
    if (!currentDraftId) {
      onClose()
      return
    }
    finalizing.current = true
    setDiscarding(true)
    setError('')
    try {
      await draftSaveQueue.current
      await api.discardDraft(currentDraftId)
      onDraftChanged()
      onClose()
    } catch (discardError) {
      finalizing.current = false
      setError(errorMessage(discardError))
      setDiscarding(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!mailboxAddress || !recipientValueIsValid(to) || !subject.trim() || !text.trim()) return
    finalizing.current = true
    setSending(true)
    setError('')
    try {
      const currentDraftId = await saveCurrentDraft(true)
      if (!currentDraftId) return
      await api.sendDraft(currentDraftId, idempotencyKey)
      onDraftChanged()
      onSent()
    } catch (sendError) {
      finalizing.current = false
      setError(errorMessage(sendError))
      setSending(false)
    }
  }

  function saveBeforeLeavingEditor(event: FocusEvent<HTMLFormElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    if (!draftLoaded || busy || finalizing.current) return
    void saveCurrentDraft().catch((saveError) => setError(errorMessage(saveError)))
  }

  return (
    <div className={`compose-backdrop ${inline ? 'compose-backdrop--inline' : ''}`}>
      <form
        className={`compose-dialog ${inline ? 'compose-dialog--inline' : ''}`}
        role={inline ? 'region' : 'dialog'}
        aria-modal={inline ? undefined : true}
        aria-labelledby="compose-title"
        aria-describedby="compose-description"
        onSubmit={submit}
        onBlur={saveBeforeLeavingEditor}
        onDragEnter={startAttachmentDrag}
        onDragOver={continueAttachmentDrag}
        onDragLeave={endAttachmentDrag}
        onDrop={dropAttachments}
      >
        {draggingAttachment && (
          <div className="compose-drop-overlay" aria-hidden="true">
            <Paperclip size={24} />
            <strong>{t('松开即可添加附件')}</strong>
            <span>{t('支持图片和文档；单个 5 MiB，合计 10 MiB')}</span>
          </div>
        )}
        <header>
          <div>
            <h2 id="compose-title">{t(draftId ? '编辑草稿' : '新建邮件')}</h2>
            <span className="compose-provider"><ShieldCheck size={13} />{t('安全发信')}</span>
          </div>
          <button className="icon-button" type="button" onClick={() => void closeAndSave()}
            aria-label={t('关闭并保留草稿')} disabled={busy || !draftLoaded}>
            <X size={18} />
          </button>
        </header>
        <div className="compose-dialog__body">
          <p className="sr-only" id="compose-description">
            {t('通过已配置的发信服务安全发送，并保存到已发送邮件。')}
          </p>
          <div className="compose-fields">
            <div className="compose-field">
              <span>{t('发件人')}</span>
              <ComposeMailboxSelect
                mailboxes={mailboxes}
                value={mailboxAddress}
                disabled={busy}
                onChange={(value) => updateDraftField('mailboxAddress', value)}
              />
            </div>
            <div className="compose-field compose-field--recipients">
              <label htmlFor={recipientId}>{t('收件人')}</label>
              <RecipientInput id={recipientId} value={to} disabled={busy} autoFocus
                onChange={(value) => updateDraftField('to', value)} />
            </div>
            <label className="compose-field compose-field--subject">
              <span>{t('主题')}</span>
              <input name="subject" type="text" autoComplete="off" value={subject}
                onChange={(event) => updateDraftField('subject', event.target.value)}
                placeholder={t('输入邮件主题…')} maxLength={500} required disabled={busy} />
            </label>
          </div>
          <label className="compose-editor">
            <span className="sr-only">{t('邮件正文')}</span>
            <textarea name="text" value={text}
              onChange={(event) => updateDraftField('text', event.target.value)}
              placeholder={t('写下邮件内容…')} maxLength={50_000} required disabled={busy} />
          </label>
          {attachments.length > 0 && (
            <section className="compose-attachments" aria-label={t('附件')}>
              <div className="compose-attachments__summary" aria-live="polite">
                <strong><Paperclip size={13} />{t('附件')}</strong>
                <span>{attachments.length}/{MAX_ATTACHMENTS} · {formatAttachmentSize(attachmentBytes)}</span>
              </div>
              <div className="compose-attachments__items">
                {attachments.map((attachment) => (
                  <span className="compose-attachment" key={attachment.id}>
                    {attachment.contentType.startsWith('image/')
                      ? <FileImage size={15} />
                      : <FileText size={15} />}
                    <span className="compose-attachment__detail">
                      <strong title={attachment.filename}>{attachment.filename}</strong>
                      <small>{formatAttachmentSize(attachment.size)}</small>
                    </span>
                    <button type="button" onClick={() => void removeAttachment(attachment)}
                      disabled={busy} aria-label={t('移除附件：{name}', { name: attachment.filename })}>
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}
          {error && <p className="inline-error" role="alert"><AlertCircle size={15} />{error}</p>}
        </div>
        <footer>
          <button className="button button--primary" type="submit"
            disabled={busy || !draftLoaded || !mailboxAddress || !recipientValueIsValid(to)
              || !subject.trim() || !text.trim()}>
            {sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
            {t('发送邮件')}
          </button>
          <input ref={attachmentInput} className="sr-only" type="file" multiple tabIndex={-1}
            aria-label={t('选择附件')} onChange={addAttachments}
            disabled={busy || attachmentLimitReached} />
          <button className="compose-attach" type="button"
            onClick={() => attachmentInput.current?.click()}
            disabled={busy || !draftLoaded || attachmentLimitReached}>
            {uploading ? <LoaderCircle className="spin" size={17} /> : <Paperclip size={17} />}
            <span>{uploading ? t('正在上传…') : t('添加附件')}</span>
          </button>
          <span className="compose-delivery-note">
            <ShieldCheck size={13} />{t('草稿自动保存；通过已配置的发信服务安全发送。')}
          </span>
          <button className="compose-discard" type="button" onClick={() => void discard()}
            disabled={busy} aria-label={t('丢弃草稿')} data-tooltip={t('丢弃草稿')}>
            {discarding ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />}
          </button>
        </footer>
      </form>
    </div>
  )
}
