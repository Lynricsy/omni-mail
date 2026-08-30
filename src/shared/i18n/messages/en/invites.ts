export const enInvites: Record<string, string> = {
  '可使用': 'Active',
  '已过期': 'Expired',
  '已使用': 'Used',
  '已撤销': 'Revoked',
  '域名已停用': 'Domain disabled',
  '{count} 天': '{count} days',
  '{count} 小时': '{count} hours',
  '请选择': 'Select',
  '浏览器没有允许复制，请手动选择邀请链接。':
    'The browser denied clipboard access. Select and copy the invitation link manually.',
  '撤销 {target} 的邀请？': 'Revoke the invitation for {target}?',
  '撤销后，该链接不能再用于注册。已经创建的账号不会受到影响。':
    'The link can no longer be used to register. Existing accounts are not affected.',
  '停止后续注册': 'Stops future registrations',
  '此操作只会停用邀请链接，不会删除已经注册的账号或邮箱。':
    'This only disables the invitation link. It does not delete registered accounts or mailboxes.',
  '确认撤销': 'Revoke invitation',
  '临时用户邀请': 'Temporary user invitation',
  '邀请管理': 'Invitation management',
  '创建普通或临时用户邀请，并跟踪使用、过期与撤销状态。':
    'Invite regular or temporary users and track usage, expiry, and revocation.',
  '邀请概况': 'Invitation summary',
  '邀请记录': 'Invitation records',
  '可用邀请': 'Active invitations',
  '已完成注册': 'Registrations completed',
  '已失效': 'Unavailable',
  '选择由管理员固定邮箱，或让访问者在指定域名下自选邮箱。':
    'Assign a fixed mailbox or let visitors choose an address under a specified domain.',
  '正在读取邀请设置…': 'Loading invitation settings…',
  '邮箱与有效期': 'Mailbox and expiry',
  '确定邮箱分配方式，并分别设置链接和账号的有效时间。':
    'Choose how the mailbox is assigned and set separate lifetimes for the link and account.',
  '邮箱分配方式': 'Mailbox assignment',
  '邀请账号类型': 'Invited account type',
  '普通用户': 'Regular user',
  '账号长期有效，使用普通用户默认存储配额。':
    'The account remains active and uses the default regular-user storage quota.',
  '临时用户': 'Temporary user',
  '账号按设定时间到期，使用临时用户默认存储配额。':
    'The account expires as configured and uses the default temporary-user storage quota.',
  '管理员指定邮箱': 'Administrator-assigned mailbox',
  '提前固定完整地址；用户注册后直接使用，不能自行新增或更改。':
    'Reserve a complete address in advance. The user receives it after registration and cannot change it.',
  '用户自选邮箱': 'User-selected mailbox',
  '管理员固定域名后缀，用户注册时填写尚未使用的邮箱前缀。':
    'The administrator fixes the domain and the user chooses an unused local part during registration.',
  '指定邮箱域名': 'Mailbox domain',
  '该域名将与下方前缀组成固定邮箱。':
    'This domain is combined with the local part below to form the fixed mailbox.',
  '用户只能填写 @ 前面的邮箱名称。':
    'The user can only choose the part before @.',
  '链接有效时间': 'Invitation link validity',
  '1 小时': '1 hour',
  '6 小时': '6 hours',
  '3 天': '3 days',
  '30 天': '30 days',
  '只控制这个链接可以注册到什么时候。':
    'Controls only how long this link can be used to register.',
  '临时账号有效时间': 'Temporary account lifetime',
  '从注册成功起计算；账号到期删除，邮箱保留。':
    'Starts after registration. The account is deleted at expiry; mailboxes remain.',
  '注册后计时；删账号、留邮箱。':
    'Starts after registration; account deleted, mailboxes kept.',
  '请选择域名': 'Select a domain',
  '地址会立即为这个邀请预留，注册后成为固定的登录邮箱和收件地址。':
    'The address is reserved immediately and becomes the fixed login and receiving address after registration.',
  '链接使用方式': 'Link usage',
  '单次使用': 'Single use',
  '固定邮箱只能分配给一个用户。':
    'A fixed mailbox can only be assigned to one user.',
  '首个用户成功注册后，链接立即失效。':
    'The link expires after the first successful registration.',
  '多人注册': 'Multiple registrations',
  '有效期内可多人注册，每次注册都需要通过 Turnstile。':
    'Multiple people can register before expiry. Every registration requires Turnstile.',
  '配置 Turnstile 后才能创建多人注册链接。':
    'Configure Turnstile before creating a multi-registration link.',
  '允许继续添加邮箱': 'Allow additional mailboxes',
  '注册时创建的首个邮箱不受此开关影响':
    'The first mailbox created at registration is not affected',
  '邮箱总数上限': 'Total mailbox limit',
  '允许使用发信服务发信与回复': 'Allow sending and replies with the configured provider',
  'Worker 仍需配置有效的发信服务':
    'The Worker must also have a valid sending provider configuration',
  '允许使用 AI 翻译邮件': 'Allow AI message translation',
  '翻译权限': 'Translation permission',
  '可以使用 AI 翻译邮件': 'Can use AI message translation',
  '不能使用 AI 翻译邮件': 'Cannot use AI message translation',
  '使用与权限': 'Usage and permissions',
  '控制链接使用人数，以及注册后可以使用的邮箱能力。':
    'Control how many people can use the link and which mailbox capabilities they receive.',
  '链接仅显示一次': 'The link is shown once',
  '生成后请立即复制并通过安全渠道发送。':
    'Copy it immediately after creation and send it through a secure channel.',
  '生成邀请链接': 'Create invitation link',
  '邀请链接已生成': 'Invitation link created',
  '出于安全考虑，关闭窗口后将无法再次查看完整链接。':
    'For security, the full link cannot be viewed again after closing this window.',
  '新邀请链接': 'New invitation link',
  '已复制': 'Copied',
  '复制': 'Copy',
  '最近邀请': 'Recent invitations',
  '历史记录仅显示状态，不保存可复制的明文链接。':
    'History shows status only and does not retain copyable plain-text links.',
  '{count} 条': '{count} entries',
  '还没有用户邀请。': 'No user invitations yet.',
  '管理员指定 · 单次使用': 'Administrator assigned · Single use',
  '用户自选 · 已注册 {count} 人': 'User selected · {count} registered',
  '用户自选 · 单次使用': 'User selected · Single use',
  '链接截止': 'Link expires',
  '账号有效期': 'Account lifetime',
  '长期有效': 'No expiry',
  '账号注册后可用 {duration}': 'Account lasts {duration} after registration',
  '账号 {duration}': 'Account {duration}',
  '最多 {count} 个邮箱': 'Up to {count} mailboxes',
  '仅首个邮箱': 'First mailbox only',
  '可发信': 'Can send',
  '可翻译': 'Can translate',
  '撤销': 'Revoke',
  '加载更多邀请': 'Load more invitations',
  '账号 {email} 已创建，但自动登录失败，请返回登录页手动登录。':
    'Account {email} was created, but automatic sign-in failed. Return to the sign-in page and sign in manually.',
  '正在验证邀请链接…': 'Verifying invitation link…',
  '这个邀请无法使用': 'This invitation is unavailable',
  '邀请链接不存在或已经失效。': 'The invitation link does not exist or has expired.',
  '返回 {appName} 登录页': 'Return to {appName} sign in',
  '创建临时邮箱账号': 'Create a temporary mailbox account',
  '创建普通邮箱账号': 'Create a regular mailbox account',
  '管理员已经为你分配好邮箱，设置密码后即可进入 {appName}。':
    'An administrator has assigned your mailbox. Set a password to enter {appName}.',
  '管理员邀请你加入 {appName}，请自行选择一个尚未使用的邮箱名称。':
    'An administrator invited you to {appName}. Choose an unused mailbox name.',
  '管理员指定域名': 'Administrator-assigned domain',
  '注册链接有效至': 'Registration link valid until',
  '注册成功后 {duration}': '{duration} after registration',
  '链接类型': 'Link type',
  '多人注册链接': 'Multi-registration link',
  '单次使用链接': 'Single-use link',
  '邮箱权限': 'Mailbox permissions',
  '固定邮箱，不能自行新增或更改':
    'Fixed mailbox; cannot add or change addresses',
  '最多创建 {count} 个邮箱': 'Create up to {count} mailboxes',
  '仅使用注册时创建的邮箱': 'Use only the mailbox created at registration',
  '发信权限': 'Sending permission',
  '可以使用发信服务发信与回复': 'Can send and reply with the configured provider',
  '仅接收与查看邮件': 'Receive and view messages only',
  '链接到期只停止注册；账号到期会自动删除，但邮箱和已有邮件继续保留。':
    'Link expiry stops new registrations. Account expiry deletes the account, while mailboxes and existing messages remain.',
  '链接到期只停止注册；已经创建的普通用户账号会长期有效。':
    'Link expiry stops new registrations. Regular user accounts already created do not expire.',
  '账号已经创建': 'Account created',
  '前往登录': 'Go to sign in',
  '该邮箱会成为固定的登录账号和收件地址，注册后不能自行更改。':
    'This becomes the fixed login and receiving address and cannot be changed after registration.',
  '选择邮箱名称': 'Choose a mailbox name',
  '只能填写邮箱 @ 前面的有效字符':
    'Enter valid characters for the part before @ only',
  '完整登录邮箱：{address}': 'Full login email: {address}',
  '设置密码': 'Set password',
  '管理员尚未配置邀请安全验证。':
    'The administrator has not configured invitation security verification.',
  '正在创建账号…': 'Creating account…',
  '创建账号并进入邮箱': 'Create account and open mailbox',
}
