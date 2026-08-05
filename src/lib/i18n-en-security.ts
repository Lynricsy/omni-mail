export const enSecurity: Record<string, string> = {
  '完成二次验证': 'Complete two-factor authentication',
  '输入验证器应用中的 6 位验证码，或使用一枚恢复码。':
    'Enter the 6-digit code from your authenticator app, or use a recovery code.',
  '验证码或恢复码': 'Verification or recovery code',
  '验证并登录': 'Verify and sign in',
  '管理员二次验证': 'Administrator two-factor authentication',
  '使用验证器应用保护高权限账户': 'Protect privileged accounts with an authenticator app',
  '正在读取安全设置…': 'Loading security settings…',
  '尚未配置加密密钥': 'Encryption key is not configured',
  '请先添加 TOTP_ENCRYPTION_KEY Worker Secret。':
    'Add the TOTP_ENCRYPTION_KEY Worker Secret first.',
  '二次验证未启用': 'Two-factor authentication is disabled',
  '启用后，密码或 Linux DO 登录都需要一次性验证码。':
    'Once enabled, password and Linux DO sign-ins both require a one-time code.',
  '开始设置': 'Start setup',
  '验证器设置二维码': 'Authenticator setup QR code',
  '扫描二维码': 'Scan the QR code',
  '也可以在验证器中手动输入下面的密钥。':
    'You can also enter the key below manually in your authenticator.',
  '已复制': 'Copied',
  '复制密钥': 'Copy key',
  '输入验证器中的 6 位验证码': 'Enter the 6-digit authenticator code',
  '确认并启用': 'Confirm and enable',
  '重新生成': 'Generate again',
  '立即保存恢复码': 'Save your recovery codes now',
  '每枚恢复码只能使用一次，关闭后不会再次显示。':
    'Each recovery code can be used once and will not be shown again.',
  '复制全部恢复码': 'Copy all recovery codes',
  '二次验证已启用': 'Two-factor authentication is enabled',
  '剩余 {count} 枚恢复码': '{count} recovery codes remaining',
  '输入验证码或恢复码以停用': 'Enter a verification or recovery code to disable',
  '停用二次验证': 'Disable two-factor authentication',
  '二次验证已过期，请重新登录。': 'Two-factor authentication expired. Sign in again.',
  '验证码或恢复码不正确。': 'The verification or recovery code is incorrect.',
  '二次验证尝试过多，请 15 分钟后再试。':
    'Too many two-factor attempts. Try again in 15 minutes.',
  '二次验证失败。': 'Two-factor authentication failed.',
  '只有管理员可以启用二次验证。': 'Only administrators can enable two-factor authentication.',
  '只有管理员可以管理二次验证。': 'Only administrators can manage two-factor authentication.',
  '请先配置 TOTP_ENCRYPTION_KEY Worker Secret。':
    'Configure the TOTP_ENCRYPTION_KEY Worker Secret first.',
  '二次验证已经启用。': 'Two-factor authentication is already enabled.',
  '没有等待确认的二次验证设置。': 'There is no pending two-factor setup to confirm.',
  '验证码不正确，请确认验证器时间保持同步。':
    'The code is incorrect. Make sure the authenticator clock is synchronized.',
  '需要有效的二次验证码或恢复码。': 'A valid two-factor or recovery code is required.',
}
