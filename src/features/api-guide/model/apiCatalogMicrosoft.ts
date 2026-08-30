import { localized as l, type ApiEndpoint } from './apiCatalogTypes'

export const microsoftEndpoints: ApiEndpoint[] = [
  {
    method: 'GET', path: '/api/microsoft/accounts', group: 'microsoft', auth: 'authenticated',
    title: l('列出 Microsoft 账号', 'List Microsoft accounts'),
    description: l('返回当前用户的脱敏账号与同步状态，不返回令牌、密码或密文。', 'Return sanitized account and synchronization state without tokens, passwords, or ciphertext.'),
    request: 'No parameters', response: '200 · { enabled, accounts }',
  },
  {
    method: 'POST', path: '/api/microsoft/accounts/import', group: 'microsoft', auth: 'authenticated',
    title: l('导入 Microsoft 账号', 'Import Microsoft accounts'),
    description: l('逐项验证 1–25 个结构化 OAuth2 账号；可确认加密保存四字段组合密码，但不用于认证。', 'Validate 1–25 structured OAuth2 accounts; confirmed four-field combination passwords may be stored encrypted but are never used for authentication.'),
    request: 'JSON · accounts[1..25] · { name?, email, authMode=oauth2, refreshToken, clientId, authority?, password?, persistPasswordConfirmed? }',
    response: '201/207 · { results: [{ index, status=accepted|duplicate|error, code?, error?, account? }] }',
    exampleBody: { accounts: [{ name: 'Outlook', email: 'owner@outlook.com', authMode: 'oauth2', refreshToken: 'refresh-token', clientId: '00000000-0000-4000-8000-000000000000', authority: 'common' }] },
    notes: [
      l('服务端只接受结构化字段；不要把整段逐行文本直接提交到该端点。', 'The server accepts structured fields only; do not submit the raw multiline import text.'),
      l('password 仅作为可选组合密码留存；提交时 persistPasswordConfirmed 必须为 true，且该密码永不参与认证。', 'password is optional retained combination data only; persistPasswordConfirmed must be true when it is sent, and the password is never used for authentication.'),
    ],
  },
  {
    method: 'PATCH', path: '/api/microsoft/accounts/:id', group: 'microsoft', auth: 'authenticated',
    title: l('重命名 Microsoft 账号', 'Rename a Microsoft account'),
    description: l('修改当前用户账号的本地显示名称。', 'Change the local display name of an account owned by the current user.'),
    request: 'Path · id; JSON · name', response: '200 · { account }', exampleBody: { name: 'Work Outlook' },
  },
  {
    method: 'PUT', path: '/api/microsoft/accounts/:id/credential', group: 'microsoft', auth: 'authenticated',
    title: l('替换 Microsoft 凭据', 'Replace a Microsoft credential'),
    description: l('验证成功后才替换 OAuth2 凭据；不允许切换为密码认证。', 'Replace OAuth2 credentials only after validation; password authentication cannot be enabled.'),
    request: 'Path · id; JSON · authMode=oauth2, refreshToken, clientId, authority?', response: '200 · { ok: true }',
    exampleBody: { authMode: 'oauth2', refreshToken: 'replacement-refresh-token', clientId: '00000000-0000-4000-8000-000000000000', authority: 'common' },
  },
  {
    method: 'DELETE', path: '/api/microsoft/accounts/:id', group: 'microsoft', auth: 'authenticated',
    title: l('断开 Microsoft 账号', 'Disconnect a Microsoft account'),
    description: l('级联删除本地密文、文件夹和元数据索引，不删除远端邮件。', 'Cascade-delete local ciphertext, folders, and metadata without deleting remote mail.'),
    request: 'Path · id', response: '200 · { ok, remoteRevocationRequired }',
  },
  {
    method: 'POST', path: '/api/microsoft/accounts/:id/verify', group: 'microsoft', auth: 'authenticated',
    title: l('验证 Microsoft 连接', 'Verify a Microsoft connection'),
    description: l('用已保存凭据验证固定 Microsoft IMAP 端点并刷新文件夹缓存。', 'Validate the fixed Microsoft IMAP endpoint with saved credentials and refresh the folder cache.'),
    request: 'Path · id', response: '200 · { ok, validatedAt }',
  },
  {
    method: 'POST', path: '/api/microsoft/accounts/:id/sync', group: 'microsoft', auth: 'authenticated',
    title: l('请求 Microsoft 同步', 'Request Microsoft synchronization'),
    description: l('在冷却和账号租约保护下，将 INBOX 只读同步加入 Queue。', 'Queue read-only INBOX synchronization under cooldown and account lease protection.'),
    request: 'Path · id', response: '202 · { queued: true }',
  },
  {
    method: 'GET', path: '/api/microsoft/accounts/:id/folders', group: 'microsoft', auth: 'authenticated',
    title: l('列出 Microsoft 文件夹', 'List Microsoft folders'),
    description: l('读取缓存文件夹；refresh=1 时先从 IMAP LIST 安全刷新。', 'Read cached folders, optionally refreshing safely with IMAP LIST when refresh=1.'),
    request: 'Path · id; Query · refresh=0|1?', response: '200 · { folders }',
    examplePath: '/api/microsoft/accounts/:id/folders?refresh=1',
  },
  {
    method: 'GET', path: '/api/microsoft/messages', group: 'microsoft', auth: 'authenticated',
    title: l('列出 Microsoft 邮件', 'List Microsoft messages'),
    description: l('按账号与服务器返回的文件夹读取本地元数据，支持搜索、1–200 条和游标分页。', 'Read local metadata by account and server-returned folder with search, 1–200 item limits, and cursor pagination.'),
    request: 'Query · accountId?, folder?, q?, limit=1..200?, cursor?, refresh=0|1?', response: '200 · { messages, page, folderPath }',
    examplePath: '/api/microsoft/messages?accountId=microsoft_account_id&folder=INBOX&limit=50',
  },
  {
    method: 'GET', path: '/api/microsoft/accounts/:accountId/messages/:messageId', group: 'microsoft', auth: 'authenticated',
    title: l('读取 Microsoft 正文', 'Read a Microsoft message'),
    description: l('再次校验用户、账号、文件夹与 UIDVALIDITY 后，通过 BODY.PEEK[] 按需读取 MIME 正文，并对未读邮件精确写入 \\Seen。', 'Revalidate user, account, folder, and UIDVALIDITY, fetch MIME content on demand with BODY.PEEK[], and write Seen for unread messages only.'),
    request: 'Path · accountId, messageId', response: '200 · { message }',
    examplePath: '/api/microsoft/accounts/microsoft_account_id/messages/message_id',
    notes: [l('已读写入失败不会阻断正文响应；移动、删除、归档、星标和其他 flags 写入均未开放。', 'A Seen write failure does not block the body response; move, delete, archive, star, and other flag writes are not available.')],
  },
  {
    method: 'GET', path: '/api/microsoft/accounts/:accountId/messages/:messageId/attachments/:partId', group: 'microsoft', auth: 'authenticated',
    title: l('下载 Microsoft 附件', 'Download a Microsoft attachment'),
    description: l('校验归属后按需读取并返回不超过 5 MiB 的附件。', 'Verify ownership, then fetch and return an attachment up to 5 MiB on demand.'),
    request: 'Path · accountId, messageId, partId', response: '200 · attachment bytes',
    examplePath: '/api/microsoft/accounts/microsoft_account_id/messages/message_id/attachments/0',
    outputFile: 'microsoft-attachment.bin',
  },
]
