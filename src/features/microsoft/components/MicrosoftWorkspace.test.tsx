import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MicrosoftAccountDialog } from './MicrosoftAccountDialog'
import { MicrosoftReader } from './MicrosoftReader'
import { MicrosoftWorkspace } from './MicrosoftWorkspace'

describe('Microsoft workspace safety and accessibility boundaries', () => {
  it('shows the deployment recovery path without removing the workspace layout', () => {
    const html = renderToStaticMarkup(
      <MicrosoftWorkspace enabled={false} remoteImagesEnabled={false} />,
    )
    expect(html).toContain('MICROSOFT_CREDENTIALS_KEY')
    expect(html).toContain('MICROSOFT_MAIL_ENABLED')
    expect(html).toContain('microsoft-list-pane')
    expect(html).toContain('选择一封 Microsoft 邮件')
    expect(html).not.toContain('正文和附件只在打开时读取')
  })

  it('opens an accessible OAuth2-only connection dialog', () => {
    const html = renderToStaticMarkup(<MicrosoftAccountDialog accounts={[]}
      onClose={() => undefined} onChanged={async () => undefined} />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('OAuth2')
    expect(html).toContain('仅支持 OAuth2')
    expect(html).not.toContain('role="combobox"')
    expect(html).toContain('Refresh token')
    expect(html).not.toContain('access_token_cipher')
  })

  it('renders the message without a persistent permission notice and exposes attachments', () => {
    const account = {
      id: 'microsoft-1', name: 'Work', email: 'user@outlook.com', status: 'active' as const,
    }
    const summary = {
      id: 'message-1', account, folderPath: 'INBOX', uidValidity: 1, uid: 2,
      senderName: 'Sender', senderAddress: 'sender@example.com', recipients: [], cc: [],
      subject: 'Subject', preview: '', date: 1, sentAt: null, sizeBytes: 10,
      isRead: false, isStarred: false, hasAttachments: true,
    }
    const html = renderToStaticMarkup(<MicrosoftReader selected={summary}
      message={{ ...summary, isRead: true, from: 'Sender <sender@example.com>', to: 'user@outlook.com',
        cc: '', date: '2026-08-25T00:00:00.000Z', body: 'Body', html: '', attachments: [{
          partId: '0', filename: 'report.pdf', contentType: 'application/pdf', size: 10,
          contentId: null, disposition: 'attachment',
        }] }} loading={false} error="" remoteImagesEnabled={false}
      onBack={() => undefined} onRetry={() => undefined} />)
    expect(html).toContain('IMAP')
    expect(html).not.toContain('仅允许已读状态写入')
    expect(html).not.toContain('gmail-readonly-note')
    expect(html).toContain('/api/microsoft/accounts/microsoft-1/messages/message-1/attachments/0')
  })
})
