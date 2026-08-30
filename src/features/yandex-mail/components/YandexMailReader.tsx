import { api, type YandexMailMessageDetail, type YandexMailMessageSummary } from '../../../shared/api'
import { ImapMessageReader } from '../../../shared/ui/mail-workspace/ImapMessageReader'

export function YandexMailReader({ selected, message, loading, error, remoteImagesEnabled,
  onBack, onRetry }: {
  selected: YandexMailMessageSummary | null
  message: YandexMailMessageDetail | null
  loading: boolean
  error: string
  remoteImagesEnabled: boolean
  onBack: () => void
  onRetry: () => void
}) {
  return <ImapMessageReader provider="Yandex 邮箱" selected={selected} message={message}
    loading={loading} error={error} remoteImagesEnabled={remoteImagesEnabled}
    attachmentUrl={api.yandexMailAttachmentUrl} onBack={onBack} onRetry={onRetry}
    showEmptyStateDescription={false} />
}
