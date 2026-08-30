export const enErrors: Record<string, string> = {
  '备份、保留、草稿或默认配额设置无效。':
    'Backup, retention, draft, or default quota settings are invalid.',
  '没有需要保存的账户更改。': 'There are no account changes to save.',
  '密码至少需要 10 个字符。': 'The password must be at least 10 characters.',
  '请输入当前密码。': 'Enter your current password.',
  '当前密码不正确。': 'The current password is incorrect.',
  '请输入当前密码以确认删除。': 'Enter your current password to confirm deletion.',
  '显示名称格式不正确。': 'The display name format is invalid.',
  '显示名称需要在 1–60 个字符之间。':
    'The display name must be between 1 and 60 characters.',
  '新密码格式不正确。': 'The new password format is invalid.',
  '只有临时用户可以自行删除账号。':
    'Only temporary users can delete their own accounts.',
  'Authorization 请求头无效。': 'The Authorization header is invalid.',
  'OmniMail 已完成初始化。': 'OmniMail setup is already complete.',
  'Origin is not allowed.': 'This request origin is not allowed.',
  '初始化令牌不正确。': 'The setup token is incorrect.',
  '初始化失败，可能已有管理员账户。':
    'Setup failed. An administrator account may already exist.',
  '访问令牌已失效，请刷新或重新登录。':
    'The access token has expired. Refresh it or sign in again.',
  '服务器暂时无法处理这个请求。':
    'The server cannot process this request right now.',
  '附件不存在。': 'The attachment does not exist.',
  '附件文件不存在。': 'The attachment file does not exist.',
  '此附件类型不支持预览。': 'This attachment type cannot be previewed.',
  '接口不存在。': 'The API endpoint does not exist.',
  '请先登录。': 'Sign in first.',
  '请先将邮件移入垃圾箱。': 'Move the message to Trash first.',
  '请先在 Worker 中配置 SETUP_TOKEN Secret。':
    'Configure the SETUP_TOKEN Secret in the Worker first.',
  '请先在 Worker 中配置有效的 SUPER_ADMIN_EMAIL。':
    'Configure a valid SUPER_ADMIN_EMAIL in the Worker first.',
  '邮件不存在。': 'The message does not exist.',
  '原始邮件不存在。': 'The raw message does not exist.',
  '分页参数无效，limit 需要在 1–100 之间。':
    'Invalid pagination. Limit must be between 1 and 100.',
  '日志分页游标无效。': 'The audit log cursor is invalid.',
  '只有管理员可以查看操作日志。':
    'Only administrators can view the audit log.',
  '只有管理员可以运行部署自检。':
    'Only administrators can run deployment checks.',
  '请输入有效的域名。': 'Enter a valid domain.',
  '缺少域名状态。': 'The domain status is missing.',
  '域名不存在。': 'The domain does not exist.',
  '域名格式无效。': 'The domain format is invalid.',
  '这个域名已经存在。': 'This domain already exists.',
  '只有管理员可以删除域名。': 'Only administrators can delete domains.',
  '只有管理员可以设置域名。': 'Only administrators can update domains.',
  '只有管理员可以添加域名。': 'Only administrators can add domains.',
  '当前账户没有创建邮箱的权限。':
    'This account cannot create mailboxes.',
  '当前账户没有管理邮箱的权限。':
    'This account cannot manage mailboxes.',
  '请输入有效的完整邮箱地址。': 'Enter a valid complete email address.',
  '缺少邮箱状态。': 'The mailbox status is missing.',
  '邮箱更新内容无效。': 'The mailbox update is invalid.',
  '邮箱地址不存在。': 'The mailbox address does not exist.',
  '邮箱地址格式无效。': 'The mailbox address format is invalid.',
  '这个邮箱地址已经启用。': 'This mailbox address is already enabled.',
  '这个邮箱地址已属于其他账户。':
    'This mailbox address belongs to another account.',
  '这个邮箱地址已由用户邀请预留。':
    'This mailbox address is reserved by a user invitation.',
  '这个域名尚未在系统设置中启用。':
    'This domain is not enabled in System settings.',
  '主邮箱不能停用。': 'The primary mailbox cannot be disabled.',
  '只能将已启用的邮箱设为主邮箱。': 'Only an enabled mailbox can be made primary.',
  '主邮箱不能删除。': 'The primary mailbox cannot be deleted.',
  '邮箱删除服务暂时不可用，请稍后重试。':
    'Mailbox deletion is temporarily unavailable. Try again later.',
  '邮箱删除任务启动失败，请稍后重试。':
    'The mailbox deletion task could not start. Try again later.',
  '只有管理员可以修改随机邮箱格式。':
    'Only administrators can change the random mailbox format.',
  '随机邮箱前缀格式无效。': 'The random mailbox prefix is invalid.',
  '邮件分页游标无效。': 'The message cursor is invalid.',
  '邮箱筛选条件无效。': 'The mailbox filter is invalid.',
  '登录尝试过多，请 15 分钟后再试。':
    'Too many sign-in attempts. Try again in 15 minutes.',
  '邮箱或密码不正确。': 'The email or password is incorrect.',
  '请输入有效的登录邮箱。': 'Enter a valid login email.',
  '该登录邮箱已经注册。': 'This login email is already registered.',
  '该邮箱不能用于外部注册。':
    'This email cannot be used for public registration.',
  '管理员当前未开放外部注册。':
    'The administrator has not enabled public registration.',
  '规则无效；允许列表至少需要一个后缀，最多可以设置 100 个完整域名。':
    'Invalid policy. The allow list needs at least one suffix and supports up to 100 complete domains.',
  '请先配置 TURNSTILE_SITE_KEY 和 TURNSTILE_SECRET_KEY。':
    'Configure TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY first.',
  '只有管理员可以修改注册设置。':
    'Only administrators can change registration settings.',
  '只有管理员可以修改注册邮箱限制。':
    'Only administrators can change the registration email policy.',
  '注册保护尚未配置，请联系管理员。':
    'Registration protection is not configured. Contact an administrator.',
  '注册请求过多，请稍后再试。':
    'Too many registration attempts. Try again later.',
  '注册设置无效。': 'The registration setting is invalid.',
  '当前账户没有回信权限。': 'This account cannot send replies.',
  '当前账户没有发信权限。': 'This account cannot send messages.',
  '管理员尚未配置发信服务。': 'No sending provider is configured by the administrator.',
  'RESEND_DOMAIN_CONFIGS 格式无效。': 'RESEND_DOMAIN_CONFIGS contains invalid JSON.',
  'SENDFLARE_DOMAIN_CONFIGS 格式无效。': 'SENDFLARE_DOMAIN_CONFIGS contains invalid JSON.',
  'SENDFLARE_FROM 必须是有效邮箱地址。': 'SENDFLARE_FROM must be a valid email address.',
  'SendFlare 暂不支持附件，请为该域名配置 Resend 后重试。':
    'SendFlare does not support attachments yet. Configure Resend for this domain and try again.',
  '该发件域名尚未配置发信服务。': 'No sending provider is configured for this sender domain.',
  '发件邮箱格式无效。': 'The sender mailbox is invalid.',
  '请输入有效的收件邮箱地址。': 'Enter a valid recipient email address.',
  '一封邮件最多添加 50 个收件人。': 'A message can have up to 50 recipients.',
  '邮件主题需要在 1–500 个字符之间。':
    'The subject must be between 1 and 500 characters.',
  '邮件正文需要在 1–50,000 个字符之间。':
    'The message body must be between 1 and 50,000 characters.',
  '发件邮箱不存在或已停用。': 'The sender mailbox does not exist or is disabled.',
  '无法创建待发送邮件。': 'Could not create the outgoing message.',
  '回复内容需要在 1–50,000 个字符之间。':
    'The reply must be between 1 and 50,000 characters.',
  '无法创建回复。': 'Could not create the reply.',
  '无效的请求标识。': 'The request identifier is invalid.',
  '这封邮件无法回复。': 'This message cannot be replied to.',
  '无人收件邮件不能直接回复。':
    'Unassigned mail cannot be replied to directly.',
  '只有管理员可以查看全站统计。':
    'Only administrators can view site-wide statistics.',
  '远程图片设置无效。': 'The remote image setting is invalid.',
  '只有管理员可以修改远程图片设置。':
    'Only administrators can change remote image settings.',
  '只有管理员可以修改无人收件设置。':
    'Only administrators can change unassigned mail settings.',
  '无人收件设置无效。': 'The unassigned mail setting is invalid.',
  '只有管理员可以修改自动刷新设置。':
    'Only administrators can change auto-refresh settings.',
  '自动刷新档位无效。': 'The auto-refresh interval is invalid.',
  '请输入有效的指定邮箱前缀。':
    'Enter a valid local part for the assigned mailbox.',
  '请先配置 Turnstile，再创建多人注册链接。':
    'Configure Turnstile before creating a multi-registration link.',
  '请选择已启用的域名。': 'Select an enabled domain.',
  '邀请安全验证尚未配置，请联系管理员。':
    'Invitation security verification is not configured. Contact an administrator.',
  '邀请不存在。': 'The invitation does not exist.',
  '邀请分页游标无效。': 'The invitation cursor is invalid.',
  '邀请链接不存在。': 'The invitation link does not exist.',
  '邀请链接刚刚失效，请向管理员申请新链接。':
    'The invitation link has just expired. Ask an administrator for a new one.',
  '邀请配置无效。': 'The invitation configuration is invalid.',
  '邀请注册尝试过多，请稍后再试。':
    'Too many invitation registration attempts. Try again later.',
  '这个邮箱地址刚刚被使用，请换一个前缀。':
    'This mailbox address was just taken. Choose another local part.',
  '这个邮箱地址已经被使用。': 'This mailbox address is already in use.',
  '这个邮箱地址已经被使用或预留。':
    'This mailbox address is already in use or reserved.',
  '只有管理员可以查看邀请。':
    'Only administrators can view invitations.',
  '只有管理员可以撤销邀请。':
    'Only administrators can revoke invitations.',
  '只有管理员可以创建邀请。':
    'Only administrators can create invitations.',
  '设备会话不存在。': 'The device session does not exist.',
  '设备名称需要在 1–80 个字符之间。':
    'The device name must be between 1 and 80 characters.',
  '刷新令牌无效，请重新登录。':
    'The refresh token is invalid. Sign in again.',
  '刷新令牌已失效，请重新登录。':
    'The refresh token has expired. Sign in again.',
  '不能修改这个账户。': 'This account cannot be modified.',
  '只有普通用户和临时用户可以自行注销账号。':
    'Only regular and temporary users can delete their own accounts.',
  '请输入当前登录邮箱以确认注销。':
    'Enter your current login email to confirm account deletion.',
  '创建失败，这个登录邮箱可能已经存在。':
    'Creation failed. This login email may already exist.',
  '用户不存在。': 'The user does not exist.',
  '用户分页游标无效。': 'The user cursor is invalid.',
  '用户权限配置无效。': 'The user access configuration is invalid.',
  '这个邮箱已经由 Worker 配置为主管理员。':
    'This email is configured as the owner by the Worker.',
  '只有管理员可以查看用户。': 'Only administrators can view users.',
  '只有管理员可以创建用户。': 'Only administrators can create users.',
  '只有管理员可以设置用户。': 'Only administrators can update users.',
  '只有主管理员可以授予管理员角色。':
    'Only the owner can grant the administrator role.',
  '只有主管理员可以管理全站邮件。':
    'Only the owner can manage mail across the system.',
  '邮件管理筛选条件无效。': 'The mail management filters are invalid.',
  '邮件管理参数无效，单次最多选择 50 封邮件。':
    'The mail management request is invalid. Select no more than 50 messages.',
  '只有主管理员可以浏览备份。': 'Only the owner can browse backups.',
  '只有主管理员可以下载备份。': 'Only the owner can download backups.',
  '只有主管理员可以执行恢复演练。': 'Only the owner can run recovery drills.',
}
