# Gmail 聚合收件箱使用说明

OmniMail 通过固定的 `imap.gmail.com:993` TLS 连接聚合多个 Gmail 账号的 INBOX。它不使用
Google Cloud Project 或 OAuth Client；用户打开正文后会同步标记 Gmail 已读，但不会归档、
移动、删除、星标或发信。

## 部署者配置

1. 在 Worker 的 **Variables & Secrets** 中新增 Secret `GMAIL_CREDENTIALS_KEY`。
2. 值至少为 32 个随机 UTF-8 字节，并与 iCloud、Linux DO Mail 的密钥分开保存。
3. 运行 `npm run db:migrate` 后重新部署。
4. 可选：把 `GMAIL_IMAP_ENABLED` 设为 `false`，紧急隐藏入口并停止定时入队。

不要在仓库、`.env`、截图或日志中保存生产密钥。密钥丢失后，已保存的 Gmail 应用密码无法解密，
需要用户逐个更新。

## 用户连接步骤

1. 在 Google 账号中开启两步验证。
2. 打开 [Google 应用专用密码](https://myaccount.google.com/apppasswords)。
3. 创建名称为 `OmniMail` 或包含部署实例名称的密码。
4. 在 OmniMail 左侧打开 **Gmail 邮箱 → 管理 Gmail 账号**。
5. 填写账号名称、完整邮箱地址和 Google 显示的 16 位应用密码。

应用密码可按原显示格式粘贴空格。请勿填写 Google 账号主密码。某些 Workspace、
Advanced Protection 或仅使用安全密钥进行两步验证的账号可能没有应用密码入口。

## 同步与已读行为

- 首次连接索引最近 100 封 INBOX 邮件，之后每 5 分钟错峰同步。
- 每账号最多保留最近 500 封元数据；正文和附件只在打开时读取，不保存到 D1 / R2。
- 正文先使用 `BODY.PEEK[]` 读取；打开成功后使用受控 `UID STORE ... (\Seen)` 同步已读状态。
- 除标记已读外，不允许其他 Gmail 远端写操作。
- 单个账号失败不会阻断其他 Gmail 账号或 OmniMail 主邮箱。
- 手动同步一分钟内只能请求一次；重复 Queue 任务由账号租约去重。

## 常见错误

| 状态 | 处理方式 |
| --- | --- |
| 应用密码失效 | 重新生成应用密码，并在账号管理中选择“更新密码” |
| 连接超时 | 稍后重试；系统也会按有限退避再次同步 |
| 缺少 IMAP 扩展 | 确认这是 Gmail / Workspace Gmail 账号，且组织允许 IMAP |
| 响应超过读取上限 | 该邮件或邮箱搜索结果过大；缩小邮箱规模后重试 |
| Workspace 无应用密码 | 联系组织管理员；MVP 不提供 OAuth 兼容模式 |

Google 账号主密码变化时，Google 会撤销现有应用密码。OmniMail 删除连接时只删除本地密文和
索引；之后仍需回到 Google 应用密码页面手动撤销对应密码。
