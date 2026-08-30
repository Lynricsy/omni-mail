import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GmailAccountDialog } from './GmailAccountDialog'
import { GmailReader } from './GmailReader'
import { GmailWorkspace } from './GmailWorkspace'

describe('Gmail workspace accessibility boundaries', () => {
  it('shows a deployment recovery path when the credential key is missing', () => {
    const html = renderToStaticMarkup(
      <GmailWorkspace enabled={false} remoteImagesEnabled={false} />,
    )
    expect(html).toContain('GMAIL_CREDENTIALS_KEY')
    expect(html).toContain('Gmail 功能尚未启用')
    expect(html).toContain('gmail-mail-view')
    expect(html).toContain('gmail-list-pane')
    expect(html).toContain('gmail-reader-pane')
    expect(html).toContain('选择一封 Gmail 邮件')
  })

  it('opens the connection form directly with an app-password recovery link', () => {
    const html = renderToStaticMarkup(
      <GmailAccountDialog accounts={[]}
        onClose={() => undefined} onChanged={async () => undefined} />,
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('连接 Gmail 账号')
    expect(html).toContain('创建 Google 应用密码')
    expect(html).not.toContain('先开启 Google 两步验证')
    expect(html).not.toContain('app_password_cipher')
  })

  it('renders connected accounts as management entries without an account cap', () => {
    const html = renderToStaticMarkup(
      <GmailAccountDialog accounts={[{
        id: 'gmail-1', name: '个人', email: 'user@gmail.com', status: 'active',
        lastSyncedAt: 1_787_486_400, nextSyncAt: 1_787_486_700,
        lastErrorCode: '', lastErrorAt: null, createdAt: 1_787_486_400,
        hasAppPassword: true,
      }]} onClose={() => undefined} onChanged={async () => undefined} />,
    )
    expect(html).toContain('Gmail 账号管理')
    expect(html).toContain('已连接 1 个账号')
    expect(html).toContain('管理')
    expect(html).not.toContain('1/5')
    expect(html).not.toContain('每个用户最多连接')
  })

  it('shows detail failures inside the reader with an explicit retry action', () => {
    const html = renderToStaticMarkup(<GmailReader
      selected={{
        id: 'message-1',
        account: { id: 'gmail-1', name: 'Personal', email: 'user@gmail.com', status: 'active' },
        senderName: 'Sender', senderAddress: 'sender@example.com', recipients: [], cc: [],
        subject: 'Subject', preview: '', date: 1, sizeBytes: 10, isRead: false,
        isStarred: false, hasAttachments: false,
      }}
      message={null} loading={false} error="读取失败" remoteImagesEnabled={false}
      onBack={() => undefined} onRetry={() => undefined} />)

    expect(html).toContain('role="alert"')
    expect(html).toContain('无法显示这封 Gmail 邮件')
    expect(html).toContain('重试读取')
  })

  it('states that opening a message attempts to sync its Gmail read state', () => {
    const html = renderToStaticMarkup(<GmailReader
      selected={null} message={null} loading={false} error="" remoteImagesEnabled={false}
      onBack={() => undefined} onRetry={() => undefined} />)

    expect(html).toContain('打开邮件后会尝试同步 Gmail 已读状态。')
  })

  it('renders the shared animated subject and reader scroll controls', () => {
    const account = {
      id: 'gmail-1', name: 'Personal', email: 'user@gmail.com', status: 'active' as const,
    }
    const selected = {
      id: 'message-1', account, senderName: 'Sender', senderAddress: 'sender@example.com',
      recipients: ['user@gmail.com'], cc: [], subject: '安全提醒', preview: '', date: 1,
      sizeBytes: 10, isRead: true, isStarred: false, hasAttachments: false,
    }
    const html = renderToStaticMarkup(<GmailReader
      selected={selected}
      message={{ ...selected, from: 'Sender <sender@example.com>', to: 'user@gmail.com',
        cc: '', date: '2026-08-25T00:00:00.000Z', body: 'Body', html: '', attachments: [] }}
      loading={false} error="" remoteImagesEnabled={false}
      onBack={() => undefined} onRetry={() => undefined} />)

    expect(html).toContain('reader-toolbar__typewriter')
    expect(html).toContain('reader-scroll-top')
    expect(html).toContain('Gmail 邮件')
    expect(html).toContain('安全提醒')
  })
})
