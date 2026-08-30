export const enApi: Record<string, string> = {
  'API 使用': 'API guide',
  '从其他工具安全调用当前 OmniMail 实例。':
    'Call this OmniMail instance securely from other tools.',
  '完整 API 文档': 'Full API documentation',
  '完整 API 参考': 'Complete API reference',
  '已按 Worker 路由源码核对并覆盖全部 {count} 个接口；展开任一接口即可查看权限、参数、响应和可复制示例。':
    'Verified against the Worker route source and covering all {count} endpoints. Expand any endpoint to see permissions, parameters, responses, and a copyable example.',
  '源码覆盖 {count}/{count}': 'Source coverage {count}/{count}',
  '搜索接口': 'Search endpoints',
  '搜索路径、方法、用途或参数': 'Search paths, methods, uses, or parameters',
  '按 API 模块筛选': 'Filter by API module',
  '当前显示 {count} 个接口': 'Showing {count} endpoints',
  '{count} 个接口': '{count} endpoints',
  '公开接口': 'Public',
  '可选认证': 'Optional authentication',
  '登录或 Bearer Token': 'Session or bearer token',
  '仅网站 Cookie': 'Website cookie only',
  '管理员': 'Administrator',
  '仅主管理员': 'Owner only',
  'Webhook 签名': 'Webhook signature',
  '认证与权限': 'Authentication and permissions',
  '请求参数': 'Request',
  '成功响应': 'Success response',
  '使用注意': 'Usage notes',
  '调用示例': 'Request example',
  '没有匹配的 API 接口': 'No matching API endpoints',
  '尝试搜索 messages、token、admin 或字段名称。':
    'Try searching for messages, token, admin, or a field name.',
  '清除筛选': 'Clear filters',
  '令牌与凭据安全': 'Token and credential security',
  '调用完整接口目录前，请先确认自动化工具能够安全保存和轮换凭据。':
    'Before using the complete catalog, confirm that your automation tool can store and rotate credentials securely.',
  '当前实例': 'Current instance',
  '连接一次，按账户权限访问': 'Connect once, access with account permissions',
  'OmniMail 使用设备会话令牌，不提供永久 API Key。先签发短期 Access Token，再通过 Authorization 请求头调用接口。':
    'OmniMail uses device session tokens instead of permanent API keys. Issue a short-lived access token, then call endpoints with the Authorization header.',
  'API 基础地址': 'API base URL',
  '认证方式': 'Authentication',
  '15 分钟': '15 minutes',
  '30 天': '30 days',
  '内容已复制到剪贴板。': 'Content copied to the clipboard.',
  '无法访问剪贴板，请手动复制内容。':
    'Clipboard access is unavailable. Copy the content manually.',
  '获取设备令牌': 'Get a device token',
  '使用登录邮箱和密码签发令牌。令牌明文只返回一次，请立即保存到工具的加密凭据存储。':
    'Issue tokens with your login email and password. Plaintext tokens are returned only once; save them immediately in the tool’s encrypted credential store.',
  '启用了 MFA？': 'Using MFA?',
  '把 mfaCode 替换为当前验证码或恢复码；未启用 MFA 时该字段会被忽略。':
    'Replace mfaCode with the current verification or recovery code. The field is ignored when MFA is disabled.',
  '仅 Linux DO 登录的账户': 'Linux DO-only accounts',
  '设备令牌接口当前需要密码凭据；仅通过 Linux DO 创建且没有密码的账户暂时不能使用此签发流程。':
    'The device token endpoint currently requires password credentials. Accounts created only through Linux DO without a password cannot use this issuance flow yet.',
  '调用邮件接口': 'Call a mail endpoint',
  '把返回的 accessToken 放入 Authorization 请求头。下面的示例读取收件箱第一页。':
    'Put the returned accessToken in the Authorization header. The example below reads the first Inbox page.',
  '选择代码示例': 'Choose a code example',
  '接入 n8n、Postman 或其他工具': 'Connect n8n, Postman, or another tool',
  '在工具的 HTTP Request 步骤中填写相同的 URL、方法和请求头；无需 OmniMail 专用插件。':
    'Use the same URL, method, and headers in the tool’s HTTP Request step. No OmniMail-specific plugin is required.',
  '请求方法': 'Method',
  '认证': 'Authentication',
  '请求头': 'Header',
  '请求与响应': 'Requests and responses',
  'JSON 请求需要 Content-Type: application/json。':
    'JSON requests require Content-Type: application/json.',
  '收到 401 时最多刷新一次；刷新失败后重新登录。':
    'On a 401 response, refresh at most once. Sign in again if refresh fails.',
  '邮件分页游标必须原样传回，不能解析或修改。':
    'Return mail pagination cursors unchanged; do not parse or modify them.',
  '发信接口仍会检查邮箱归属、账户权限和发送限速。':
    'Sending endpoints still enforce mailbox ownership, account permissions, and rate limits.',
  '浏览器跨域调用': 'Cross-origin browser requests',
  '命令行和服务端工具可以直接请求。其他网页前端必须先把精确来源加入 Worker 的 APP_ORIGINS。':
    'Command-line and server-side tools can call the API directly. Other web frontends must first add their exact origin to the Worker APP_ORIGINS setting.',
  '刷新与撤销令牌': 'Refresh and revoke tokens',
  '刷新会同时轮换两个令牌。工具必须原子替换保存的 Refresh Token，退出时再主动撤销。':
    'Refresh rotates both tokens. The tool must replace the saved refresh token atomically and revoke it when disconnecting.',
  '刷新令牌': 'Refresh tokens',
  'Access Token 过期后调用': 'Call after the access token expires',
  '撤销令牌': 'Revoke tokens',
  '停用集成或退出时调用': 'Call when disconnecting or signing out',
  '常用邮件接口': 'Common mail endpoints',
  '路径均相对于上方 API 基础地址；完整参数和返回结构请查看原始文档。':
    'Paths are relative to the API base URL above. See the full documentation for parameters and response schemas.',
  '读取当前账户的邮箱地址': 'List mailboxes for the current account',
  '读取、筛选并分页浏览邮件': 'List, filter, and paginate messages',
  '读取邮件正文、线程与附件信息': 'Read message content, thread, and attachment metadata',
  '使用已配置的发信服务发送邮件': 'Send mail through the configured provider',
  '读取当前账户的草稿': 'List drafts for the current account',
  '回复邮件并可附加文件': 'Reply to a message with optional attachments',
  '不要把令牌写入日志或普通配置文件':
    'Do not write tokens to logs or plain configuration files',
  'Access Token 只保存在运行内存；Refresh Token 应放入系统或自动化平台提供的加密凭据存储。':
    'Keep the access token in runtime memory only. Store the refresh token in an encrypted credential store provided by the system or automation platform.',
}
