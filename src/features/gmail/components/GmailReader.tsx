import { api, type GmailMessageDetail, type GmailMessageSummary } from '../../../shared/api'
import { ImapMessageReader } from '../../../shared/ui/mail-workspace/ImapMessageReader'

export function GmailReader({ selected, message, loading, error, remoteImagesEnabled,
  onBack, onRetry }: {
  selected: GmailMessageSummary | null
  message: GmailMessageDetail | null
  loading: boolean
  error: string
  remoteImagesEnabled: boolean
  onBack: () => void
  onRetry: () => void
}) {
  return <ImapMessageReader provider="Gmail" selected={selected} message={message}
    loading={loading} error={error} remoteImagesEnabled={remoteImagesEnabled}
    attachmentUrl={api.gmailAttachmentUrl} onBack={onBack} onRetry={onRetry} />
}
