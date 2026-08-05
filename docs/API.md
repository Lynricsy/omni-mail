# OmniMail HTTP API

OmniMail 网页端与桌面端共用 Core Worker 的 JSON API。浏览器默认使用
`HttpOnly` Cookie；桌面端应使用短期 Access Token，并用 Refresh Token
轮换续期。两种认证方式执行完全相同的用户角色、邮箱归属和发信权限检查。

下面示例中的 API 地址使用 `https://mail.example.com`。生产环境中前端与 API
由同一个 Worker 提供，API 路径统一位于 `/api/*`。

## 公开配置与注册

未登录客户端可以读取公开运行配置：

```http
GET /api/config
```

响应中的 `registrationEnabled` 表示管理员是否允许外部注册，`registrationAvailable`
表示当前所选方式的配置是否完整。`registrationMethod` 为 `password` 或 `linuxdo`，
`linuxDoLoginEnabled` 只表示 Connect 凭据已经配置。开关关闭时，
`POST /api/register` 返回 `403`。`registrationProtectionReady` 表示 Worker
是否已经配置完整的 Turnstile 公钥和密钥，`turnstileSiteKey` 是前端渲染组件时
使用的公开 Site Key。`mailRefreshInterval` 是管理员设置的收件箱自动刷新秒数，
`unassignedMailEnabled` 表示是否将未知收件地址的邮件交给主管理员，
值为 `0`、`5`、`10`、`30`、`60` 或 `120`，其中 `0` 表示关闭自动刷新。
`registrationDomainPolicy` 包含公开注册邮箱规则模式和后缀数组。`blocklist`
表示拒绝列表内的后缀，`allowlist` 表示只允许列表内的后缀。
`setupRequirements` 只返回 D1、R2、Queue、主管理员邮箱和 `SETUP_TOKEN`
是否已经配置的布尔值，不会返回变量或 Secret 的内容。

```http
POST /api/register
Content-Type: application/json

{
  "displayName": "Example User",
  "email": "user@example.com",
  "password": "at-least-10-characters",
  "turnstileToken": "token-from-turnstile-widget"
}
```

Worker 会将令牌、来源 IP、`action=register` 和当前 Webmail Hostname 发送到 Cloudflare
Siteverify 验证。令牌只能使用一次，验证失败后客户端必须重新生成。注册成功后
创建普通用户并返回 `201`，浏览器同时获得登录 Cookie。新用户默认邮箱额度为 1，
可从已启用域名中选择 1 个尚未占用的邮箱地址，但默认没有发信权限。
管理员可通过以下接口修改开关：

```http
PATCH /api/admin/settings/registration
Authorization: Bearer om_at_...
Content-Type: application/json

{ "enabled": true, "method": "password" }
```

该接口仅管理员可用，并会写入操作日志。`password` 模式要求完整的 Turnstile
配置，`linuxdo` 模式要求 `LINUX_DO_CLIENT_ID` 和 `LINUX_DO_CLIENT_SECRET`；
配置不完整时开启请求返回 `409`。关闭开关不会删除或停用已有账户。

Linux DO 使用 OAuth2 授权码流程：

```http
GET /api/auth/linux-do?returnTo=https%3A%2F%2Fmail.example.com
GET /api/auth/linux-do/callback?code=...&state=...
```

首个接口生成十分钟有效、保存在 `HttpOnly`、`SameSite=Lax` 专用 Cookie 中的
state，然后重定向到 Linux DO。回调消费并清除 Cookie，在 Worker 内换取访问令牌
并读取社区用户不可变 ID；令牌不会写入
D1。未知身份只在注册开关开启且方式为 `linuxdo` 时创建普通账号。Linux DO 不提供
登录邮箱，因此本地使用 `linuxdo-{id}@oauth.omnimail.invalid` 作为不可投递的内部标识。
新账号进入邮箱后会打开邮箱地址选择界面，创建规则与 `POST /api/mailboxes` 相同。

管理员可更新公开注册邮箱后缀允许/禁止规则：

```http
PATCH /api/admin/settings/registration-domains
Authorization: Bearer om_at_...
Content-Type: application/json

{
  "mode": "blocklist",
  "domains": ["qq.com", "163.com"]
}
```

后缀会转为小写、去重并按域名排序，最多设置 100 个。`qq.com` 同时匹配
`user@qq.com` 和 `user@mail.qq.com`，但不会匹配 `user@notqq.com`。禁止列表
可以为空；允许列表至少需要一个后缀，避免误操作后锁死全部公开注册。

注册限制为同一 IP 每小时 3 次、每天 10 次，同一登录邮箱每小时 3 次。超过限制
返回 `429`，并通过 `Retry-After` 响应头提供建议等待秒数。Turnstile 不可用时
Worker 采用失败关闭策略并返回 `503`，不会绕过验证继续创建账户。

管理员可更新所有用户使用的自动刷新间隔：

```http
PATCH /api/admin/settings/mail-refresh
Authorization: Bearer om_at_...
Content-Type: application/json

{ "interval": 30 }
```

管理员可设置 HTML 邮件是否默认加载 HTTPS 远程图片：

```http
PATCH /api/admin/settings/remote-images
Authorization: Bearer om_at_...
Content-Type: application/json

{ "enabled": true }
```

该设置通过 `GET /api/config` 的 `remoteImagesEnabled` 字段返回。关闭时邮件阅读器
仍允许 `data:` 与 `cid:` 图片，但不会向远程图片服务器发起请求。

管理员可开启或关闭无人收件：

```http
PATCH /api/admin/settings/unassigned-mail
Authorization: Bearer om_at_...
Content-Type: application/json

{ "enabled": true }
```

开启后，已启用管理域名下尚未创建邮箱地址的邮件会进入主管理员收件箱，并显示
原始收件地址。关闭时继续在收件阶段拒绝；关闭开关不会删除已经接收的邮件。

## 邀请注册安全

单次邀请的注册请求按来源 IP 和邀请令牌分别限速，超限返回 `429` 和
`Retry-After`。多人注册链接要求 Worker 已配置 Turnstile，并在注册时提交
专用的 `action=temporary-invite` 令牌。管理员创建邀请时可通过
`accountRole` 选择 `user`（长期有效的普通用户）或 `temporary`（限时临时用户）：

```http
POST /api/admin/invites
Content-Type: application/json

{
  "accountRole": "user",
  "domain": "example.com",
  "expiresInHours": 24,
  "multiUse": false,
  "addressMode": "self_selected",
  "mailboxLimit": 1,
  "canCreateMailboxes": false,
  "canReply": false,
  "canTranslate": true
}
```

`canTranslate` 控制注册后的账户能否查看已有译文或请求新的 AI 翻译。

邀请注册请求如下：

```http
POST /api/invitations/{inviteToken}
Content-Type: application/json

{
  "displayName": "Invited User",
  "localPart": "guest",
  "password": "at-least-10-characters",
  "turnstileToken": "token-from-turnstile-widget"
}
```

单次邀请可以省略 `turnstileToken`；多人邀请缺少或未通过验证时不会创建账户。

## 获取设备令牌

```http
POST /api/auth/token
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password",
  "deviceName": "OmniMail Desktop / Windows"
}
```

成功响应：

```json
{
  "tokenType": "Bearer",
  "accessToken": "om_at_...",
  "expiresIn": 900,
  "refreshToken": "om_rt_...",
  "refreshExpiresIn": 2592000,
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "role": "user"
  }
}
```

- Access Token 有效 15 分钟，只保存在桌面应用内存中。
- Refresh Token 有效 30 天，应保存在 Windows Credential Manager、macOS
  Keychain 或 Linux Secret Service，不能写入普通配置文件或日志。
- 令牌在 D1 中只保存 SHA-256 摘要，服务端无法还原明文。
- 登录失败与网页密码登录共用 IP + 邮箱限速。

## 使用 Access Token

所有原本需要登录的 `/api/*` 接口都接受：

```http
Authorization: Bearer om_at_...
```

例如：

```http
GET /api/mailboxes
Authorization: Bearer om_at_...
```

访问令牌过期或被撤销时返回 `401`。桌面端收到 `401` 后应先尝试刷新一次；
刷新失败则清除本地令牌并让用户重新登录。

## 刷新与退出

刷新会同时轮换 Access Token 和 Refresh Token。请求成功后，旧的两个令牌
都会立即失效，客户端必须原子替换本地保存的 Refresh Token。

```http
POST /api/auth/token/refresh
Content-Type: application/json

{ "refreshToken": "om_rt_..." }
```

主动退出时使用当前 Refresh Token：

```http
POST /api/auth/token/revoke
Content-Type: application/json

{ "refreshToken": "om_rt_..." }
```

撤销接口是幂等的，即使令牌已经失效也返回 `{ "ok": true }`。使用 Bearer
Token 调用现有 `POST /api/logout` 也会撤销当前设备会话。

修改密码、管理员封禁账号、临时账号到期或用户自助删除账号，都会撤销该账号
所有设备令牌。邮箱和历史邮件仍按原有保留规则处理。

## 设备管理

已登录用户可以查看和撤销自己的桌面设备：

```http
GET /api/auth/devices
Authorization: Bearer om_at_...
```

```http
DELETE /api/auth/devices/{deviceSessionId}
Authorization: Bearer om_at_...
```

用户只能操作自己的设备会话。设备列表不会返回任何令牌明文。

## 游标分页

邮件、管理员用户列表和邀请列表支持游标分页：

```http
GET /api/messages?folder=inbox&limit=30
Authorization: Bearer om_at_...
```

响应保留原有数组字段，并增加 `page`：

```json
{
  "messages": [],
  "counts": {
    "unread": 0,
    "starred": 0,
    "sent": 0,
    "trash": 0
  },
  "page": {
    "hasMore": true,
    "nextCursor": "opaque-cursor",
    "limit": 30
  }
}
```

读取下一页时原样传回游标：

```http
GET /api/messages?folder=inbox&limit=30&cursor=opaque-cursor
Authorization: Bearer om_at_...
```

规则：

- `limit` 范围为 1–100；邮件默认 30，用户默认 50，邀请默认 30。
- `cursor` 是不透明值，客户端不应解析、修改或长期保存。
- 翻页期间必须保持 `folder`、`q`、`mailbox` 和 `domain` 等筛选参数不变。
- 邮件列表的 `q` 会匹配发件人、主题和已建立索引的正文；历史邮件索引由定时
  任务逐步补齐。
- `nextCursor` 为 `null` 或 `hasMore` 为 `false` 时已经到达最后一页。
- 排序使用“时间 + 唯一 ID”，新邮件到达时不会导致已读取页面重复或跳项。

### 条件同步

首次邮件列表响应包含 `version` 和 `unchanged: false`。后续轮询可以传回版本：

```http
GET /api/messages?folder=inbox&limit=30&version=42
```

列表未变化时只返回 `{ "unchanged": true, "version": 42 }`，不会再次执行列表和
计数扫描。浏览器端还会在同源标签页之间协调轮询，同一时刻只保留一个可见页面
主动刷新。

### 主动发送邮件

```http
POST /api/messages
Content-Type: application/json

{
  "mailboxAddress": "owner@example.com",
  "to": "friend@example.net",
  "subject": "Hello",
  "text": "Message body",
  "idempotencyKey": "request_12345678"
}
```

发件邮箱必须属于当前用户且处于启用状态，用户需要具备发信权限，并且该域名已配置
Resend 或 SendFlare 发信服务。
接口同时保存纯文本和安全生成的 HTML 正文，并将结果写入“已发送”；同一个
`idempotencyKey` 不会重复投递。

主动发件、草稿发送和线程回复共享用户级限速：默认每分钟最多 10 封、每个 UTC
自然日最多 200 封。超过限制时返回 `429`，`Retry-After` 响应头给出建议等待秒数；
相同 `idempotencyKey` 的重试不会重复计数。

管理员通过以下接口管理限速：

```http
GET /api/admin/settings/outbound-rate-limit
PATCH /api/admin/settings/outbound-rate-limit
PATCH /api/admin/users/{id}/outbound-rate-limit
POST /api/admin/users/{id}/outbound-rate-limit/reset
```

全局设置包含 `enabled`、`minuteLimit`（1–100）和 `dayLimit`（1–10,000）。用户设置
包含可为 `null` 的 `minuteLimit` 与 `dayLimit`，`null` 表示继承全局默认值。用户列表
同时返回有效限额、当前分钟/UTC 日用量及重置时间。修改配置和清零操作都会写入审计日志。

### 草稿与发件附件

每个用户默认保留最近 5 份服务端草稿；管理员可按主管理员、管理员、普通用户和临时用户
分别设置 1–20 份的保存上限。超过上限时按更新时间自动清理最早的草稿及其附件：

```http
GET /api/drafts
POST /api/drafts
GET /api/drafts/{draftId}
PUT /api/drafts/{draftId}
DELETE /api/drafts/{draftId}
```

`POST` 和 `PUT` 的 JSON 字段为 `mailboxAddress`、`to`、`subject` 和 `text`。草稿允许收件人、
主题或正文暂未填写完整；真正发送时仍执行完整邮件校验。

附件使用 `multipart/form-data` 上传，字段名为 `file`：

```http
POST /api/drafts/{draftId}/attachments
DELETE /api/drafts/{draftId}/attachments/{attachmentId}
```

单个附件最多 5 MiB，每封最多 5 个且合计最多 10 MiB。上传时即计入用户空间；
删除或丢弃草稿会释放空间。完成草稿后提交幂等请求：

```http
POST /api/drafts/{draftId}/send
Content-Type: application/json

{ "idempotencyKey": "request_12345678" }
```

服务端会原子地把草稿附件转入已发送邮件，再异步交给已配置的发信服务投递。
SendFlare 当前不支持附件；存在 Resend 配置时自动回退，否则发送任务明确失败。首次入队失败时，
使用相同 `idempotencyKey` 重试不会重复创建邮件。

### 批量邮件操作

```http
PATCH /api/messages/bulk
Content-Type: application/json

{
  "ids": ["message-id-1", "message-id-2"],
  "action": "read"
}
```

`action` 支持 `read`、`unread`、`star`、`unstar`、`trash`、`restore` 和
`delete`。单次最多 50 封，只会处理当前用户拥有的邮件；`delete` 只永久删除已经
位于垃圾箱中的邮件。

`GET /api/messages/{id}` 除 `message` 外还返回按时间排序的 `thread` 摘要数组。
会话只依据 `Message-ID`、`In-Reply-To` 和 `References` 关联，不会用相同主题
猜测关系。

### 全站邮件管理

只有主管理员可以查询和管理所有用户的邮件：

```http
GET /api/admin/messages?q=invoice&user=user%40example.com&direction=incoming&folder=inbox&status=ready&days=30&limit=30
GET /api/admin/messages/{id}
GET /api/admin/messages/{id}/attachments/{attachmentId}
GET /api/admin/messages/{id}/raw
PATCH /api/admin/messages/bulk
Content-Type: application/json

{ "ids": ["message-id-1"], "action": "trash" }
```

列表支持主题、发件人、收件人、正文、所属用户和邮箱筛选，以及游标分页。
`action` 只接受 `trash`、`restore` 和 `delete`，单次最多 50 封；`delete`
只永久删除已经位于垃圾箱的邮件。主管理员打开邮件不会修改所属用户的已读或
星标状态。查看正文、下载附件或原始邮件、移入垃圾箱、恢复和永久删除都会写入
操作日志。永久删除只清理主邮件存储，备份副本仍按备份保留策略保存。

分页接口：

| 接口 | 数组字段 | 权限 |
| --- | --- | --- |
| `GET /api/messages` | `messages` | 当前用户自己的邮箱 |
| `GET /api/admin/users` | `users` | 管理员 |
| `GET /api/admin/invites` | `invites` | 管理员 |

## 备份浏览与只读演练

主管理员可以按固定分类分页浏览私有备份桶：

```http
GET /api/admin/backups/objects?prefix=d1/daily/&limit=30
GET /api/admin/backups/download?key=d1%2Fdaily%2F2026-07-29.sql
POST /api/admin/backups/drill
Content-Type: application/json

{ "key": "d1/daily/2026-07-29.sql" }
```

允许的分类为 `d1/daily/`、`d1/weekly/`、`d1/monthly/`、`mail/raw/` 和
`mail/sent/`。演练只读取对象样本并检查 D1 导出、原始邮件或发件正文结构，
不会导入数据、修改 D1 或覆盖生产对象；执行结果会写入操作日志。

## 操作日志

管理员可以读取登录安全和重要业务操作：

```http
GET /api/admin/audit-logs?days=7&category=auth&q=example.com&limit=50
Authorization: Bearer om_at_...
```

`days` 支持 `1`、`7`、`30`、`90`；`category` 支持 `all`、`auth`、
`account`、`user`、`mailbox`、`domain`、`invitation`、`message` 和
`system`。`q` 可以搜索操作者、目标、操作名称和来源 IP，后续页面使用通用
`cursor` 参数。

日志详情会递归移除名称中包含 password、token、secret、authorization 或
cookie 的字段。登录失败日志只记录邮箱、来源 IP、客户端类型和失败原因，不记录
提交的密码。

## 部署自检

管理员可以重新检查 Worker 资源绑定、生产来源、安全设置与邮件服务：

```http
GET /api/admin/deployment-check
Authorization: Bearer om_at_...
```

响应按 `core`、`security`、`mail` 分组，每项状态为 `ready`、`missing`、
`warning` 或 `manual`。该接口只返回配置状态、数量和修复说明，不返回环境变量值、
API Key、初始化令牌或其他 Secret。Email Routing 无法由当前 Worker 直接读取，
因此始终标记为需要管理员人工确认。

## 版本与更新

管理员打开系统设置时可以查询当前安装版本与 GitHub 最新 Release：

```http
GET /api/admin/version
Authorization: Bearer om_at_...
```

响应包含 `currentVersion`、`latestVersion`、`updateAvailable`、`checkFailed`、
`checkedAt`、`releaseUrl`、`releaseRepository`、`automaticUpdate` 和
`automaticUpdateReason`。成功结果最多缓存一小时；GitHub 暂时不可用不会影响
其他系统功能。

配置 Cloudflare Workers Builds 后，主管理员可以启动并查询精确 Release Tag 更新：

```http
POST /api/admin/version/update
Content-Type: application/json

{ "targetVersion": "0.2.0" }

GET /api/admin/version/update/{buildId}
```

POST 接口会重新确认最新 Release 并解析 Tag 的提交 SHA，再使用 production branch
和该 SHA 触发构建。GET 返回 `queued`、`running`、`succeeded` 或 `failed`；Token、
Trigger ID 和 Cloudflare API 原始响应不会返回给浏览器。未配置远程构建的 Clone
部署继续使用手动更新模式。

## 常用资源

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/config` | 公开运行配置与外部注册状态 |
| `POST /api/register` | 外部注册普通用户 |
| `GET /api/auth/linux-do` | 开始 Linux DO Connect 登录 |
| `GET /api/auth/linux-do/callback` | Linux DO OAuth 回调 |
| `GET /api/session` | 查询当前 Cookie 或 Bearer 会话 |
| `GET /api/mailboxes` | 当前用户邮箱列表 |
| `POST /api/mailboxes` | 按用户权限创建邮箱 |
| `GET /api/messages` | 邮件列表、筛选与分页 |
| `POST /api/messages` | 使用已配置的发信服务主动发送邮件 |
| `GET/POST /api/drafts` | 列出或新建当前用户草稿 |
| `GET/PUT/DELETE /api/drafts/{id}` | 读取、保存或丢弃指定草稿 |
| `POST /api/drafts/{id}/attachments` | 上传草稿附件 |
| `DELETE /api/drafts/{id}/attachments/{attachmentId}` | 删除草稿附件 |
| `POST /api/drafts/{id}/send` | 幂等发送草稿及附件 |
| `GET /api/messages/{id}` | 邮件正文和附件元数据 |
| `PATCH /api/messages/{id}` | 已读、星标和文件夹状态 |
| `PATCH /api/messages/bulk` | 当前用户最多 50 封邮件的批量状态或删除操作 |
| `DELETE /api/messages/{id}` | 永久删除垃圾箱邮件并释放空间 |
| `GET /api/messages/{id}/raw` | 下载原始 `.eml` |
| `POST /api/messages/{id}/reply` | 使用已配置的发信服务在线程内回复 |
| `GET /api/admin/statistics` | 管理员邮件统计 |
| `GET /api/admin/messages` | 主管理员查询和筛选全站邮件 |
| `GET /api/admin/messages/{id}` | 主管理员读取任意用户邮件正文 |
| `PATCH /api/admin/messages/bulk` | 主管理员批量移入垃圾箱、恢复或永久删除邮件 |
| `GET /api/admin/mail-cleanup/preview` | 按范围、类型和邮件时间预估清理影响 |
| `POST /api/admin/mail-cleanup` | 经数量复核后每批永久清理最多 50 封邮件 |
| `GET /api/admin/audit-logs` | 管理员操作日志、筛选与游标分页 |
| `GET /api/admin/deployment-check` | 管理员部署资源与服务配置自检 |
| `GET /api/admin/version` | 当前版本与 GitHub Release 更新状态 |
| `POST /api/admin/version/update` | 主管理员按最新 Release Tag 启动 Cloudflare 构建 |
| `GET /api/admin/version/update/{buildId}` | 主管理员查询更新构建状态 |
| `GET /api/admin/users` | 管理员用户列表 |
| `GET /api/admin/invites` | 管理员邀请列表 |
| `GET /api/admin/settings/storage` | 查询备份、保留期、默认配额和分角色草稿上限 |
| `PATCH /api/admin/settings/storage` | 更新备份、保留期、默认配额和分角色草稿上限 |
| `POST /api/admin/backups` | 手动启动一次备份 |
| `GET /api/admin/backups/objects` | 分页浏览备份对象 |
| `GET /api/admin/backups/download` | 下载指定备份对象 |
| `POST /api/admin/backups/drill` | 对指定备份执行只读结构演练 |
| `PATCH /api/admin/settings/registration` | 管理员开启或关闭外部注册 |
| `PATCH /api/admin/settings/registration-domains` | 管理员设置注册邮箱允许/禁止规则 |
| `PATCH /api/admin/settings/mail-refresh` | 管理员设置邮件自动刷新间隔 |
| `PATCH /api/admin/settings/remote-images` | 管理员设置邮件远程图片默认策略 |
| `PATCH /api/admin/settings/unassigned-mail` | 管理员开启或关闭无人收件 |
| `GET /api/admin/settings/outbound-rate-limit` | 查询全局发信限速设置 |
| `PATCH /api/admin/settings/outbound-rate-limit` | 更新全局发信限速设置 |
| `PATCH /api/admin/users/{id}/outbound-rate-limit` | 设置用户发信限速覆盖值 |
| `POST /api/admin/users/{id}/outbound-rate-limit/reset` | 清零用户当前发信计数 |

附件和原始邮件接口同样支持 Bearer Token。桌面端下载文件时需要通过 HTTP
客户端设置 `Authorization` 请求头，不能把 Token 拼接到 URL 查询参数中。

当前仓库处于 `0.x` 阶段，第一版沿用网页端现有 `/api/*` 路径，没有复制一套
`/api/v1/*` 路由。发布稳定版前如需破坏性调整，应新增版本化路径并保留旧接口
一段迁移期。
