# Microsoft 邮箱当前实现说明

> 初始调研：2026-08-25
>
> 实现基线：2026-08-26，`feature/microsoft-mail-integration`
>
> 状态：功能、测试和 Cloudflare Worker 部署链路已实现；本文只描述当前代码，不保留已取消方案

## 1. 当前结论

OmniMail 已提供独立的 Microsoft 邮箱工作区，支持用户连接多个 Outlook.com、Hotmail、Live，
以及租户允许 IMAP 的 Microsoft 365 委托式邮箱。当前实现只覆盖 Azure Global。

认证路径只有一条：

```text
refresh token + Client ID
  -> Microsoft OAuth v2 token endpoint
  -> access token
  -> outlook.office365.com:993 TLS
  -> IMAP SASL XOAUTH2
```

仅邮箱密码导入、IMAP `LOGIN`、ROPC、网页登录自动化和 OAuth2 失败后的密码回退均已停用。
四字段组合中携带的 password 只可在用户明确确认后独立加密留存，不参与任何登录、验证、同步
或失败回退。

运行时不依赖第三方 Outlook 收件服务，不向第三方发送邮箱、令牌、密码或邮件内容。Microsoft
Graph 也不是当前实现的一部分。

## 2. 已实现的产品能力

### 账号连接

- 分字段录入：账号名称、邮箱地址、refresh token、Client ID、authority 和可选组合密码。
- 批量导入：浏览器解析逐行文本，先安全预览，再逐账号验证并导入。
- 新账号保存前必须真实完成 token 兑换、IMAP XOAUTH2、`LIST` 和 INBOX `EXAMINE`。
- 重复邮箱不会覆盖已有账号；每一项独立返回成功、重复或稳定错误。
- 组合密码存在时，安全预览页必须勾选允许服务端加密保存，之后才会上传。

### 账号管理

- 查看邮箱、脱敏 Client ID、连接状态和最近错误码；替换凭据表单会带入当前 authority。
- 修改本地备注名称。
- 重新验证当前凭据与 IMAP 权限。
- 手动把当前账号 INBOX 同步加入 Queue。
- 真实验证成功后替换 refresh token、Client ID 和 authority。
- 单个断开，或进入批量管理后选择多个账号顺序断开。
- 断开只删除 OmniMail 本地凭据、文件夹和邮件索引；远端邮件及 Microsoft 应用授权不删除。

### 工作区

- “全部 Microsoft”聚合所有已连接账号的 INBOX 元数据。
- 选择单个账号后，可浏览 Microsoft `LIST` 返回的文件夹。
- 每页数量支持 25、50、100、200，服务端接受范围为 1–200，默认 50。
- 搜索发件人、收件人、抄送和主题；使用不透明游标分页。
- 顶部复制按钮在单账号范围复制当前邮箱，在全部范围复制账号列表中的第一个邮箱。
- 范围面板中每个账号也提供独立复制按钮，复制不会切换范围或关闭面板。
- 全部范围的同步按钮逐账号调用单账号同步接口，把所有账号 INBOX 加入 Queue。
- 单账号范围的刷新按钮直接受限刷新当前文件夹，然后重新读取本地元数据。
- 账号范围、文件夹、数量、管理入口和复制入口集中在范围面板与列表标题栏。

### 邮件读取

- 列表长期保存的只是有限元数据，不保存正文或附件内容。
- 打开邮件时用 `BODY.PEEK[]` 按需获取完整 MIME，并解析纯文本、HTML、CID 图片和附件。
- 正文成功读取后，如果本地记录仍为未读，使用独立 IMAP 会话精确执行：

  ```imap
  SELECT <validated-folder>
  UID STORE <validated-uid> +FLAGS.SILENT (\Seen)
  ```

- 写入前重新校验用户、账号、文件夹、UIDVALIDITY 和 UID。
- 已读写入失败不会阻断正文响应，也不会把本地索引错误标记为已读。
- 附件按需重新读取 MIME，单个下载上限为 5 MiB；远程完整 MIME 响应上限为 10 MiB。
- 不提供发信、回复、删除、移动、归档、星标或除 `\Seen` 外的远端 flags 写入。

## 3. OAuth2 输入格式

页面分隔符是四个连字符 `----`，只支持以下两类 OAuth2 凭据。

### 完整组合

```text
email----password----refresh_token----client_id
email----password----client_id----refresh_token
```

最后两段允许互换。浏览器要求其中必须且只能有一段是合法 UUID，并把它识别为 Client ID；
另一段作为 refresh token。两段都像 UUID 或都不像 UUID 时拒绝，不猜测字段位置。

password 不参与认证。只有用户在安全预览页明确勾选保存许可后，它才会作为
`combination_password_cipher` 加密留存。

### 仅 OAuth2

```text
email--------refresh_token----client_id
```

八个连续连字符表示四字段中的 password 为空。该格式仍会被统一解析成 `authMode=oauth2`。

### 已停用格式

```text
email----password
```

前端解析器和结构化 API 都会拒绝该格式，并返回 `password_auth_removed` 或对应可读错误。

### 浏览器解析规则

1. 去掉每行 BOM、首尾空白和空行，不改写 token 或 password 内部字符。
2. 只接受恰好四字段；若 password 本身包含 `----`，要求改用分字段录入。
3. 邮箱转为小写后做基础格式校验。
4. Client ID 必须是 UUID；refresh token 必须非空。
5. 当前批次按规范化邮箱去重。
6. 预览只显示邮箱、OAuth2 模式、是否含组合密码和脱敏 Client ID。
7. refresh token、password 和完整 Client ID 不在预览中回显。
8. 一次页面批次最多 25 行；页面逐项向导入 API 提交，以显示真实进度和单项结果。

结构化 API 接收的模型为：

```json
{
  "name": "Work Outlook",
  "email": "owner@outlook.com",
  "authMode": "oauth2",
  "refreshToken": "<refresh-token>",
  "clientId": "00000000-0000-4000-8000-000000000000",
  "authority": "common",
  "password": "<optional-combination-password>",
  "persistPasswordConfirmed": true
}
```

`password` 不存在时不要发送 `persistPasswordConfirmed`。存在时该字段必须严格为 `true`。

## 4. OAuth 与 IMAP 网络边界

允许的 OAuth endpoint 只有：

```text
https://login.microsoftonline.com/{authority}/oauth2/v2.0/token
```

`authority` 只允许：

- `common`
- `consumers`
- `organizations`
- 合法 tenant UUID

token 请求固定使用：

```text
grant_type=refresh_token
scope=https://outlook.office.com/IMAP.AccessAsUser.All offline_access
```

IMAP 主机和端口固定为 `outlook.office365.com:993`，强制 TLS。导入数据和 API 请求都不能指定
OAuth URL、IMAP 主机、端口、TLS 策略、代理或原始 IMAP 命令。

如果 token 响应包含轮换后的 refresh token，服务端会在账号级 token lease 下原子替换旧密文。
有效 access token 会在过期前复用；IMAP OAuth 认证收到 400/401 时，只允许强制刷新并重试一次。

## 5. 同步模型

### 后台 INBOX 同步

- 新账号连接成功后尝试加入一次 `reason=connect` 的同步任务；Queue 失败时由 Cron 后续补偿。
- Cron 约每 5 分钟扫描 `active` 或可重试 `error` 账号，每批最多加入 50 个任务。
- Queue 消费者使用 6 分钟账号同步 lease，避免同一账号并发同步。
- 首次/常规后台同步读取最近 100 条目标元数据。
- 每个账号、每个文件夹本地最多保留最近 500 条元数据。
- Queue 临时失败最多有限重试；凭据、权限、响应过大等不可重试错误直接确认任务。

### 手动同步

- `POST /api/microsoft/accounts/{id}/sync` 把指定账号 INBOX 加入 Queue。
- 单账号手动同步冷却为 60 秒。
- 工作区“全部 Microsoft”按钮在浏览器端并行调用每个账号的单账号同步接口，没有额外批量 API。
- 凭据或权限错误状态的账号需要先修复，不能继续手动入队。

### 当前文件夹刷新

- `GET /api/microsoft/messages?...&refresh=1` 要求同时传 `accountId`。
- 服务端直接登录并刷新当前已验证文件夹，冷却为 30 秒。
- 后台定时同步仍只覆盖 INBOX；其他文件夹只在用户主动刷新时更新。

## 6. 数据与凭据

### D1 迁移

- `0027_microsoft_imap.sql`
- `0028_microsoft_oauth_combination_password.sql`

当前表：

- `microsoft_imap_accounts`
- `microsoft_imap_folders`
- `microsoft_imap_messages`
- `microsoft_imap_validation_limits`

远端消息身份固定为：

```text
account_id + folder_path + uid_validity + imap_uid
```

UID 不能脱离文件夹和 UIDVALIDITY 单独使用。UIDVALIDITY 改变时会删除该文件夹旧索引，再进行
有限重建。远端已删除 UID 会从本地索引移除。

### 兼容字段说明

`0027` 的表约束仍包含 `auth_mode=password` 与 `password_cipher`，用于旧迁移兼容；`0028` 会把
已有密码账号标为 `credential_error/password_auth_removed`，当前导入校验和 IMAP session 都拒绝
密码认证。新账号只会写入 `auth_mode=oauth2`。

四字段组合 password 使用新增的 `combination_password_cipher`，与认证用凭据完全分离。

### 加密

部署 Secret `MICROSOFT_CREDENTIALS_KEY` 必须至少包含 32 个 UTF-8 字节。服务端先 SHA-256
派生 AES-GCM key，再用 12 字节随机 IV 加密。AAD 形式为：

```text
user_id:account_id:refresh-token
user_id:account_id:access-token
user_id:account_id:combination-password
```

refresh token、短期 access token、组合 password 和密文都不会通过列表 API、日志、审计、URL、
公共缓存或导出接口返回。

## 7. HTTP API

当前共 11 个端点：

| 方法 | 路径 | 当前用途 |
| --- | --- | --- |
| `GET` | `/api/microsoft/accounts` | 返回功能状态和当前用户的脱敏账号 |
| `POST` | `/api/microsoft/accounts/import` | 独立验证并导入 1–25 个结构化 OAuth2 账号 |
| `PATCH` | `/api/microsoft/accounts/{id}` | 修改本地备注名称 |
| `PUT` | `/api/microsoft/accounts/{id}/credential` | 验证成功后替换 OAuth2 凭据 |
| `DELETE` | `/api/microsoft/accounts/{id}` | 删除本地凭据、文件夹和索引 |
| `POST` | `/api/microsoft/accounts/{id}/verify` | 重新验证 token、IMAP 和文件夹 |
| `POST` | `/api/microsoft/accounts/{id}/sync` | 受限加入该账号 INBOX 同步 |
| `GET` | `/api/microsoft/accounts/{id}/folders` | 读取缓存文件夹，可用 `refresh=1` 重新 LIST |
| `GET` | `/api/microsoft/messages` | 聚合 INBOX 或读取单账号文件夹元数据 |
| `GET` | `/api/microsoft/accounts/{accountId}/messages/{messageId}` | 按需读取 MIME 并尝试同步已读 |
| `GET` | `/api/microsoft/accounts/{accountId}/messages/{messageId}/attachments/{partId}` | 按需下载附件 |

完整请求字段和 cURL 示例见 [Microsoft API 参考](api/microsoft.md)。

所有 JSON 响应使用 `Cache-Control: private, no-store`。资源查询始终联合校验当前 user ID、
account ID 和 message ID；不存在或不属于当前用户时返回相同的资源不存在边界。

## 8. 速率与安全限制

- 凭据导入、替换、重新验证和主动文件夹 LIST 共用用户/IP 哈希验证窗口。
- 窗口为 10 分钟，允许 50 次，用于容纳两批 25 项导入。
- 手动账号同步冷却 60 秒；当前文件夹远程刷新冷却 30 秒。
- 账号名称最长 60 字符；refresh token 最长 16,384 字符；组合密码最长 1,024 字符。
- 查询关键词在服务端截断到 120 字符。
- 文件夹只能来自该账号已缓存的 `LIST` 结果，不能由任意用户字符串直接选中。
- IMAP metadata 每批最多抓取 20 个 UID，并受协议响应和总执行时间限制。
- HTML 使用现有沙箱与 CSP 渲染，下载响应使用安全文件名、`nosniff` 和 `private, no-store`。

## 9. 前端交互现状

- 连接/管理弹窗在桌面端统一使用最大 820px 的响应式固定高度，小屏使用 92dvh。
- 标题区固定，表单、账号列表和导入内容只在内部滚动；滚动条仅交互时显示。
- 弹窗打开使用淡入、上移和轻微缩放，关闭使用更快的反向动画，并尊重
  `prefers-reduced-motion`。
- 批量导入分为“输入账号”和“安全确认”两步；输入框占满预留区域且禁止拖动改变高度。
- 逐项导入时当前账号显示转圈，成功显示对勾后向右移出，其余账号平滑上移；预览框和操作按钮
  保持位置稳定。
- 账号管理支持批量选择和二次确认断开；删除进度与结果通过可访问状态区域反馈。
- 图标按钮均有可访问名称；弹窗有焦点陷阱，关闭后恢复触发按钮焦点。

## 10. 当前代码位置

前端：

```text
src/features/microsoft/api/microsoft-api-client.ts
src/features/microsoft/components/MicrosoftWorkspace.tsx
src/features/microsoft/components/MicrosoftScopeSwitcher.tsx
src/features/microsoft/components/MicrosoftAccountDialog.tsx
src/features/microsoft/components/MicrosoftBatchImport.tsx
src/features/microsoft/components/MicrosoftReader.tsx
src/features/microsoft/model/microsoft-import.ts
src/features/microsoft/styles/microsoft-workspace.css
```

Worker：

```text
email-worker/src/features/microsoft/microsoft-routes.ts
email-worker/src/features/microsoft/microsoft-account-api.ts
email-worker/src/features/microsoft/microsoft-message-api.ts
email-worker/src/features/microsoft/microsoft-token.ts
email-worker/src/features/microsoft/microsoft-token-manager.ts
email-worker/src/features/microsoft/microsoft-session.ts
email-worker/src/features/microsoft/microsoft-imap.ts
email-worker/src/features/microsoft/microsoft-sync.ts
email-worker/src/features/microsoft/microsoft-store.ts
email-worker/src/features/microsoft/microsoft-credentials.ts
```

共用 IMAP 连接仍位于 `email-worker/src/platform/imap/`。Microsoft 专有解析、状态和协议边界没有
塞回 Gmail 或 iCloud 目录。

## 11. 测试与验收

仓库当前覆盖：

- OAuth2 token endpoint、scope、轮换和 token lease；
- AES-GCM 上下文隔离与密钥错误；
- OAuth2-only 输入校验和两种批量顺序；
- XOAUTH2、LIST、EXAMINE、UID SEARCH/FETCH、MIME、附件和 `\Seen`；
- D1 用户隔离、唯一约束、同步 lease、UID 对账和状态转换；
- 连接、替换、验证、同步、断开和跨用户 API 边界；
- 批量导入两步流、逐项动画、批量断开、范围复制、全部账号同步和移动端布局 E2E。

提交前使用：

```bash
npm test
npm run test:e2e -- e2e/microsoft-workspace.e2e.ts --workers=1
npm run build
```

自动化测试使用受控响应，不包含真实 Microsoft 凭据。部署者仍应按
[Microsoft 邮箱设置指南](MICROSOFT_SETUP.md)完成自己的真实账号验收。

## 12. 当前明确不做

- Microsoft Graph、Webhook 或 Graph `Mail.Read` token 通道。
- 自动获取 refresh token、硬编码第三方 Client ID 或借用 Microsoft 第一方应用。
- ROPC、MFA/条件访问绕过、代理池或网页登录自动化。
- 仅邮箱密码、IMAP LOGIN 或 OAuth2 失败后的密码回退。
- shared mailbox、application permissions 或组织全邮箱抓取。
- Azure China、GCC High、DoD 等 national cloud。
- IMAP IDLE、秒级实时推送或所有文件夹的后台持续同步。
- 长期保存正文、HTML、CID 图片或附件内容。
- 发信、回复、删除、移动、归档、星标或除 `\Seen` 外的远端写入。

## 13. 官方资料

- [Microsoft IMAP/POP/SMTP OAuth 与 XOAUTH2](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth)
- [Microsoft refresh token 生命周期](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)
- [Microsoft OAuth 2.0 授权码流程](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
