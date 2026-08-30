import {
  AlertCircle,
  AtSign,
  FilePenLine,
  LoaderCircle,
  Paperclip,
  Send,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import type { DraftSummary } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'
import { formatMessageDate } from '../../../shared/mail/formatting'
import { DangerConfirmDialog } from '../../../shared/ui/dialogs/DangerConfirmDialog'

export function DraftList({
  drafts,
  limit,
  loading,
  selectedId,
  onOpen,
  onDelete,
}: {
  drafts: DraftSummary[]
  limit: number
  loading: boolean
  selectedId: string | null | undefined
  onOpen: (draft: DraftSummary) => void
  onDelete: (draft: DraftSummary) => Promise<void>
}) {
  const [pendingDelete, setPendingDelete] = useState<DraftSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setError('')
    try {
      await onDelete(pendingDelete)
      setPendingDelete(null)
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="list-state" role="status">
      <LoaderCircle className="spin" size={21} /><span>{t('正在读取草稿')}</span>
    </div>
  }

  if (!drafts.length) {
    return <div className="list-state list-state--empty">
      <span className="empty-symbol"><FilePenLine size={24} /></span>
      <strong>{t('还没有草稿')}</strong>
      <span>{t('关闭未发送的邮件后，草稿会保存在这里。')}</span>
    </div>
  }

  return <>
    <div className="draft-list-status" role="status">
      <span>{t('已保存 {count}/{limit} 封草稿', { count: drafts.length, limit })}</span>
      <small>{t('新草稿超过上限时会清理最早的一封')}</small>
    </div>
    {error && <p className="list-error" role="alert"><AlertCircle size={15} />{error}</p>}
    <div className="draft-list" role="list" aria-label={t('草稿列表')}>
      {drafts.map((draft) => {
        const selected = selectedId === draft.id
        return <article className={`draft-row ${selected ? 'is-selected' : ''}`} role="listitem" key={draft.id}>
          <button
            className="draft-row__main"
            type="button"
            aria-current={selected ? 'page' : undefined}
            aria-label={t('继续编辑草稿：{subject}', { subject: draft.subject || t('无主题') })}
            onClick={() => onOpen(draft)}
          >
            <span className="draft-row__top">
              <strong><Send size={12} />{draft.to || t('未填写收件人')}</strong>
              <time dateTime={new Date(draft.updatedAt).toISOString()}>
                {formatMessageDate(draft.updatedAt)}
              </time>
            </span>
            <span className="draft-row__subject">{draft.subject || t('无主题')}</span>
            <span className="draft-row__preview">{draft.preview || t('暂无正文预览')}</span>
            <span className="draft-row__meta">
              <span><AtSign size={11} />{draft.mailboxAddress}</span>
              {draft.attachmentCount > 0 && (
                <span><Paperclip size={11} />{draft.attachmentCount}</span>
              )}
            </span>
          </button>
          <button
            className="draft-row__delete"
            type="button"
            aria-label={t('删除草稿：{subject}', { subject: draft.subject || t('无主题') })}
            data-tooltip={t('删除草稿')}
            onClick={() => setPendingDelete(draft)}
          >
            <Trash2 size={15} />
          </button>
        </article>
      })}
    </div>
    {pendingDelete && (
      <DangerConfirmDialog
        icon={Trash2}
        eyebrow={t('草稿箱')}
        title={t('删除这封草稿？')}
        description={t('草稿“{subject}”将从草稿箱中删除。', {
          subject: pendingDelete.subject || t('无主题'),
        })}
        impactTitle={t('草稿无法恢复')}
        impactDescription={t('正文和草稿附件都会被永久删除。')}
        confirmLabel={t(deleting ? '正在删除…' : '删除草稿')}
        onCancel={() => !deleting && setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    )}
  </>
}
