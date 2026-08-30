import { localized as l, type ApiEndpoint } from './apiCatalogTypes'

export const yandexMailEndpoints: ApiEndpoint[] = [
  {
    method: 'GET', path: '/api/yandex-mail/accounts', group: 'yandexMail', auth: 'authenticated',
    title: l('列出 Yandex 邮箱账号', 'List Yandex Mail accounts'),
    description: l('返回当前用户的脱敏账号与同步状态，不返回应用专用密码或密文。', 'Return sanitized accounts and synchronization state without app-specific passwords or ciphertext.'),
    request: 'No parameters', response: '200 · { enabled, accounts }',
  },
  {
    method: 'POST', path: '/api/yandex-mail/accounts', group: 'yandexMail', auth: 'authenticated',
    title: l('连接 Yandex 邮箱账号', 'Connect a Yandex Mail account'),
    description: l('验证个人 @yandex.com 邮箱的应用专用密码后，加密保存并请求首次同步。', 'Validate an app-specific password for a personal @yandex.com mailbox, encrypt it, and request the initial sync.'),
    request: 'JSON · name, email, appPassword', response: '201 · { account }',
    exampleBody: { name: 'Personal Yandex Mail', email: 'owner@yandex.com', appPassword: 'yandex-app-password' },
    notes: [l('appPassword 必须是 Yandex ID 中为“邮件”创建的应用密码，不能提交 Yandex 登录密码。', 'appPassword must be a Mail app password created in Yandex ID; never submit the Yandex sign-in password.')],
  },
  {
    method: 'PATCH', path: '/api/yandex-mail/accounts/:id', group: 'yandexMail', auth: 'authenticated',
    title: l('重命名 Yandex 邮箱账号', 'Rename a Yandex Mail account'),
    description: l('修改当前用户 Yandex 邮箱账号的本地显示名称。', 'Change the local display name of a Yandex Mail account owned by the current user.'),
    request: 'Path · id; JSON · name', response: '200 · { account }',
    exampleBody: { name: 'Personal Yandex' },
  },
  {
    method: 'PUT', path: '/api/yandex-mail/accounts/:id/app-password', group: 'yandexMail', auth: 'authenticated',
    title: l('更新 Yandex 应用专用密码', 'Update a Yandex app-specific password'),
    description: l('先验证新密码，再替换密文；验证失败时保留原凭据。', 'Validate the new password before replacing ciphertext; preserve the existing credential if validation fails.'),
    request: 'Path · id; JSON · appPassword', response: '200 · { account }',
    exampleBody: { appPassword: 'replacement-app-password' },
  },
  {
    method: 'DELETE', path: '/api/yandex-mail/accounts/:id', group: 'yandexMail', auth: 'authenticated',
    title: l('断开 Yandex 邮箱账号', 'Disconnect a Yandex Mail account'),
    description: l('级联删除本地密文和元数据索引，不删除远端邮件或代为撤销应用密码。', 'Cascade-delete local ciphertext and metadata without deleting remote mail or revoking the app password.'),
    request: 'Path · id', response: '200 · { ok, remoteRevocationRequired=true }',
  },
  {
    method: 'POST', path: '/api/yandex-mail/accounts/:id/verify', group: 'yandexMail', auth: 'authenticated',
    title: l('验证 Yandex 邮箱连接', 'Verify a Yandex Mail connection'),
    description: l('使用已保存凭据重新执行只读 Yandex IMAP 登录与 EXAMINE。', 'Use the saved credential to run read-only Yandex IMAP login and EXAMINE again.'),
    request: 'Path · id', response: '200 · { ok, validatedAt }',
  },
  {
    method: 'POST', path: '/api/yandex-mail/accounts/:id/sync', group: 'yandexMail', auth: 'authenticated',
    title: l('请求 Yandex 邮箱同步', 'Request Yandex Mail synchronization'),
    description: l('在频率限制和账号租约保护下，把有限 INBOX 同步任务加入 Queue。', 'Queue a bounded INBOX synchronization under rate limiting and an account lease.'),
    request: 'Path · id', response: '202 · { queued: true }',
  },
  {
    method: 'GET', path: '/api/yandex-mail/messages', group: 'yandexMail', auth: 'authenticated',
    title: l('列出 Yandex 聚合邮件', 'List unified Yandex Mail messages'),
    description: l('按账号或全部账号搜索 D1 元数据索引，并使用稳定游标分页。', 'Search the D1 metadata index for one or all accounts with stable cursor pagination.'),
    request: 'Query · accountId?, q?, limit=1..50?, cursor?', response: '200 · { messages, page }',
    examplePath: '/api/yandex-mail/messages?limit=30',
  },
  {
    method: 'GET', path: '/api/yandex-mail/accounts/:accountId/messages/:messageId', group: 'yandexMail', auth: 'authenticated',
    title: l('读取 Yandex 邮箱正文', 'Read a Yandex Mail message'),
    description: l('校验归属与 UIDVALIDITY，通过 BODY.PEEK[] 按需读取正文，并独立尝试写入 Seen。', 'Validate ownership and UIDVALIDITY, fetch the body on demand with BODY.PEEK[], and independently attempt a Seen write.'),
    request: 'Path · accountId, messageId', response: '200 · { message }',
    examplePath: '/api/yandex-mail/accounts/yandex_mail_account_id/messages/message_id',
    notes: [l('已读写入失败不会阻断正文；不开放移动、删除、归档、星标或发信。', 'A Seen write failure does not block the body; move, delete, archive, star, and send operations are unavailable.')],
  },
  {
    method: 'GET', path: '/api/yandex-mail/accounts/:accountId/messages/:messageId/attachments/:partId', group: 'yandexMail', auth: 'authenticated',
    title: l('下载 Yandex 邮箱附件', 'Download a Yandex Mail attachment'),
    description: l('校验归属后按需读取并返回不超过 5 MiB 的附件。', 'Verify ownership, then fetch and return an attachment up to 5 MiB on demand.'),
    request: 'Path · accountId, messageId, partId', response: '200 · attachment bytes',
    examplePath: '/api/yandex-mail/accounts/yandex_mail_account_id/messages/message_id/attachments/0',
    outputFile: 'yandex-mail-attachment.bin',
  },
]
