import { api, type NaverMailMessageDetail, type NaverMailMessageSummary } from '../../../shared/api'
import { ImapMessageReader } from '../../../shared/ui/mail-workspace/ImapMessageReader'

export function NaverMailReader({ selected, message, loading, error, remoteImagesEnabled,
  onBack, onRetry }: {
  selected: NaverMailMessageSummary | null
  message: NaverMailMessageDetail | null
  loading: boolean
  error: string
  remoteImagesEnabled: boolean
  onBack: () => void
  onRetry: () => void
}) {
  return <ImapMessageReader provider="NAVER 邮箱" selected={selected} message={message}
    loading={loading} error={error} remoteImagesEnabled={remoteImagesEnabled}
    attachmentUrl={api.naverMailAttachmentUrl} onBack={onBack} onRetry={onRetry}
    showEmptyStateDescription={false} />
}
