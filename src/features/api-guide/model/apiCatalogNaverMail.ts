import { localized as l, type ApiEndpoint } from './apiCatalogTypes'

export const naverMailEndpoints: ApiEndpoint[] = [
  {
    method: 'GET', path: '/api/naver-mail/accounts', group: 'naverMail', auth: 'authenticated',
    title: l('列出 NAVER 邮箱账号', 'List NAVER Mail accounts'),
    description: l('返回当前用户的脱敏账号与同步状态，不返回应用专用密码或密文。', 'Return sanitized accounts and synchronization state without app-specific passwords or ciphertext.'),
    request: 'No parameters', response: '200 · { enabled, accounts }',
  },
  {
    method: 'POST', path: '/api/naver-mail/accounts', group: 'naverMail', auth: 'authenticated',
    title: l('连接 NAVER 邮箱账号', 'Connect a NAVER Mail account'),
    description: l('验证个人 @naver.com 邮箱的应用专用密码后，加密保存并请求首次同步。', 'Validate an app-specific password for a personal @naver.com mailbox, encrypt it, and request the initial sync.'),
    request: 'JSON · name, email, appPassword', response: '201 · { account }',
    exampleBody: { name: 'Personal NAVER Mail', email: 'owner@naver.com', appPassword: 'naver-app-password' },
    notes: [l('appPassword 必须由 NAVER 两步验证生成，不能提交 NAVER 登录密码。', 'appPassword must be generated through NAVER two-step verification; never submit the NAVER sign-in password.')],
  },
  {
    method: 'PATCH', path: '/api/naver-mail/accounts/:id', group: 'naverMail', auth: 'authenticated',
    title: l('重命名 NAVER 邮箱账号', 'Rename a NAVER Mail account'),
    description: l('修改当前用户 NAVER 邮箱账号的本地显示名称。', 'Change the local display name of a NAVER Mail account owned by the current user.'),
    request: 'Path · id; JSON · name', response: '200 · { account }',
    exampleBody: { name: 'Personal NAVER' },
  },
  {
    method: 'PUT', path: '/api/naver-mail/accounts/:id/app-password', group: 'naverMail', auth: 'authenticated',
    title: l('更新 NAVER 应用专用密码', 'Update a NAVER app-specific password'),
    description: l('先验证新密码，再替换密文；验证失败时保留原凭据。', 'Validate the new password before replacing ciphertext; preserve the existing credential if validation fails.'),
    request: 'Path · id; JSON · appPassword', response: '200 · { account }',
    exampleBody: { appPassword: 'replacement-app-password' },
  },
  {
    method: 'DELETE', path: '/api/naver-mail/accounts/:id', group: 'naverMail', auth: 'authenticated',
    title: l('断开 NAVER 邮箱账号', 'Disconnect a NAVER Mail account'),
    description: l('级联删除本地密文和元数据索引，不删除远端邮件或代为撤销应用密码。', 'Cascade-delete local ciphertext and metadata without deleting remote mail or revoking the app password.'),
    request: 'Path · id', response: '200 · { ok, remoteRevocationRequired=true }',
  },
  {
    method: 'POST', path: '/api/naver-mail/accounts/:id/verify', group: 'naverMail', auth: 'authenticated',
    title: l('验证 NAVER 邮箱连接', 'Verify a NAVER Mail connection'),
    description: l('使用已保存凭据重新执行只读 NAVER IMAP 登录与 EXAMINE。', 'Use the saved credential to run read-only NAVER IMAP login and EXAMINE again.'),
    request: 'Path · id', response: '200 · { ok, validatedAt }',
  },
  {
    method: 'POST', path: '/api/naver-mail/accounts/:id/sync', group: 'naverMail', auth: 'authenticated',
    title: l('请求 NAVER 邮箱同步', 'Request NAVER Mail synchronization'),
    description: l('在频率限制和账号租约保护下，把有限 INBOX 同步任务加入 Queue。', 'Queue a bounded INBOX synchronization under rate limiting and an account lease.'),
    request: 'Path · id', response: '202 · { queued: true }',
  },
  {
    method: 'GET', path: '/api/naver-mail/messages', group: 'naverMail', auth: 'authenticated',
    title: l('列出 NAVER 聚合邮件', 'List unified NAVER Mail messages'),
    description: l('按账号或全部账号搜索 D1 元数据索引，并使用稳定游标分页。', 'Search the D1 metadata index for one or all accounts with stable cursor pagination.'),
    request: 'Query · accountId?, q?, limit=1..50?, cursor?', response: '200 · { messages, page }',
    examplePath: '/api/naver-mail/messages?limit=30',
  },
  {
    method: 'GET', path: '/api/naver-mail/accounts/:accountId/messages/:messageId', group: 'naverMail', auth: 'authenticated',
    title: l('读取 NAVER 邮箱正文', 'Read a NAVER Mail message'),
    description: l('校验归属与 UIDVALIDITY，通过 BODY.PEEK[] 按需读取正文，并独立尝试写入 Seen。', 'Validate ownership and UIDVALIDITY, fetch the body on demand with BODY.PEEK[], and independently attempt a Seen write.'),
    request: 'Path · accountId, messageId', response: '200 · { message }',
    examplePath: '/api/naver-mail/accounts/naver_mail_account_id/messages/message_id',
    notes: [l('已读写入失败不会阻断正文；不开放移动、删除、归档、星标或发信。', 'A Seen write failure does not block the body; move, delete, archive, star, and send operations are unavailable.')],
  },
  {
    method: 'GET', path: '/api/naver-mail/accounts/:accountId/messages/:messageId/attachments/:partId', group: 'naverMail', auth: 'authenticated',
    title: l('下载 NAVER 邮箱附件', 'Download a NAVER Mail attachment'),
    description: l('校验归属后按需读取并返回不超过 5 MiB 的附件。', 'Verify ownership, then fetch and return an attachment up to 5 MiB on demand.'),
    request: 'Path · accountId, messageId, partId', response: '200 · attachment bytes',
    examplePath: '/api/naver-mail/accounts/naver_mail_account_id/messages/message_id/attachments/0',
    outputFile: 'naver-mail-attachment.bin',
  },
]
