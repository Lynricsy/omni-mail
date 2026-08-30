import { ArrowLeft, FilePlus2, LoaderCircle, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { t, useLocale } from '../../src/shared/i18n'
import { PanelSelect } from './PanelSelect'
import {
  type ComposeAttachmentPayload,
  type ComposeRequestInput,
  sendExtensionMessage,
} from './protocol'

const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const MAX_ATTACHMENT_TOTAL_BYTES = 10 * 1024 * 1024

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '邮件提交失败。'
}

function fileBase64(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
    }
    return btoa(binary)
  })
}

async function attachmentPayloads(files: File[]): Promise<ComposeAttachmentPayload[]> {
  return Promise.all(files.map(async (file) => ({
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    contentBase64: await fileBase64(file),
  })))
}

export function PanelCompose({
  source,
  sourceLabel,
  accountId,
  senders,
  initialTo = '',
  initialSubject = '',
  replyToMessageId,
  allowAttachments,
  allowDraft,
  onClose,
  onComplete,
}: {
  source: ComposeRequestInput['source']
  sourceLabel: string
  accountId?: string
  senders: Array<{ label: string; value: string }>
  initialTo?: string
  initialSubject?: string
  replyToMessageId?: string
  allowAttachments: boolean
  allowDraft: boolean
  onClose: () => void
  onComplete: (message: string) => void
}) {
  useLocale()
  const [sender, setSender] = useState(senders[0]?.value || '')
  const [to, setTo] = useState(initialTo)
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState<'send' | 'draft' | ''>('')
  const [error, setError] = useState('')

  function addFiles(next: FileList | null) {
    if (!next) return
    const selected = [...files, ...Array.from(next)]
    if (selected.length > MAX_ATTACHMENTS) {
      setError(t('最多添加 {count} 个附件。', { count: MAX_ATTACHMENTS }))
      return
    }
    if (selected.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
      setError(t('单个附件不能超过 5 MiB。'))
      return
    }
    if (selected.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENT_TOTAL_BYTES) {
      setError(t('附件总大小不能超过 10 MiB。'))
      return
    }
    setFiles(selected)
    setError('')
  }

  async function submit(mode: 'send' | 'draft') {
    if (!sender) {
      setError(t('请选择发件邮箱。'))
      return
    }
    if (!to.trim()) {
      setError(t('请输入收件邮箱地址。'))
      return
    }
    if (!subject.trim() || !body.trim()) {
      setError(t('请填写邮件主题和正文。'))
      return
    }
    setBusy(mode)
    setError('')
    try {
      const attachments = await attachmentPayloads(files)
      const common = {
        accountId,
        sender,
        to: to.trim(),
        subject: subject.trim(),
        text: body.trim(),
        attachments,
      }
      if (mode === 'draft') {
        await sendExtensionMessage({ type: 'api:compose-save-draft', ...common })
        onComplete(t('草稿已保存到 OmniMail。'))
      } else {
        await sendExtensionMessage({
          type: 'api:compose-send', source, replyToMessageId, ...common,
        })
        onComplete(t('邮件已加入发送队列。'))
      }
    } catch (submitError) {
      setError(errorText(submitError))
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="panel-compose" aria-labelledby="panel-compose-title">
      <header className="panel-compose-header">
        <button className="back-button" type="button" onClick={onClose}>
          <ArrowLeft size={16} />{t('返回')}
        </button>
        <div><p className="eyebrow">COMPOSE</p><h1 id="panel-compose-title">
          {replyToMessageId ? t('回复 {source} 邮件', { source: sourceLabel })
            : t('新建 {source} 邮件', { source: sourceLabel })}
        </h1></div>
      </header>
      <div className="panel-compose-fields">
        <label><span>{t('发件邮箱')}</span><PanelSelect id="compose-sender" ariaLabel={t('发件邮箱')}
          value={sender} options={senders} onChange={setSender} /></label>
        <label><span>{t('收件邮箱')}</span><input type="text" inputMode="email" value={to}
          readOnly={Boolean(replyToMessageId)} onChange={(event) => setTo(event.target.value)} /></label>
        <label><span>{t('主题')}</span><input type="text" maxLength={500} value={subject}
          readOnly={Boolean(replyToMessageId && source === 'qq')}
          onChange={(event) => setSubject(event.target.value)} /></label>
        <label><span>{t('正文')}</span><textarea maxLength={50_000} value={body}
          onChange={(event) => setBody(event.target.value)} /></label>
        {allowAttachments && <div className="panel-compose-attachments">
          <label htmlFor="compose-attachments"><FilePlus2 size={15} aria-hidden="true" />
            {t('添加附件')}</label>
          <input id="compose-attachments" type="file" multiple
            onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
          {files.map((file, index) => <div key={`${file.name}:${file.size}:${index}`}>
            <span title={file.name}>{file.name}</span><button type="button"
              aria-label={t('移除附件 {filename}', { filename: file.name })}
              onClick={() => setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))}>
              <Trash2 size={13} /></button></div>)}
          <small>{t('最多 5 个；单个 5 MiB，合计 10 MiB。')}</small>
        </div>}
        {error && <div className="panel-compose-error" role="alert">{error}</div>}
      </div>
      <footer className="panel-compose-actions">
        {allowDraft && !replyToMessageId && <button type="button" disabled={Boolean(busy)}
          onClick={() => void submit('draft')}>
          {busy === 'draft' && <LoaderCircle className="spin" size={14} />}{t('保存草稿')}</button>}
        <button className="is-primary" type="button" disabled={Boolean(busy)}
          onClick={() => void submit('send')}>
          {busy === 'send' ? <LoaderCircle className="spin" size={14} /> : <Send size={14} />}
          {busy === 'send' ? t('正在提交…') : t('发送邮件')}</button>
      </footer>
    </section>
  )
}
