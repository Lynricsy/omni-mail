import { api, type QqMailMessageDetail, type QqMailMessageSummary } from '../../../shared/api'
import { ImapMessageReader } from '../../../shared/ui/mail-workspace/ImapMessageReader'

export function QqMailReader({ selected, message, loading, error, remoteImagesEnabled,
  onBack, onRetry, onReply }: {
  selected: QqMailMessageSummary | null
  message: QqMailMessageDetail | null
  loading: boolean
  error: string
  remoteImagesEnabled: boolean
  onBack: () => void
  onRetry: () => void
  onReply: () => void
}) {
  return <ImapMessageReader provider="QQ 邮箱" selected={selected} message={message}
    loading={loading} error={error} remoteImagesEnabled={remoteImagesEnabled}
    attachmentUrl={api.qqMailAttachmentUrl} onBack={onBack} onRetry={onRetry}
    onReply={message ? onReply : undefined} showEmptyStateDescription={false} />
}
