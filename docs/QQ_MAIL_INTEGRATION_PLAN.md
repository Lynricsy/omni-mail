# QQ 邮箱接入计划

- 状态：Web IMAP MVP 与单收件人 SMTP 新建/回复已实现；待生产 Worker 真实 QQ 账号链路验收
- 计划日期：2026-08-25
- 推荐首版：个人 `@qq.com` 邮箱、授权码登录、独立多账号收件工作区
- 首版协议：`imap.qq.com:993`，直接 TLS
- 首版远端写操作：仅在正文成功读取后尝试标记 `\Seen`
- 后续可选阶段：`smtp.qq.com:465`，直接 TLS 发信

## 1. 目标与成功标准

在不影响 OmniMail 主邮箱、iCloud、Linux DO Mail 和 Gmail 工作区的前提下，允许当前登录用户
连接自己有权访问的个人 QQ 邮箱，并在独立工作区中完成以下流程：

1. 使用完整 QQ 邮箱地址和 QQ 邮箱生成的授权码验证并保存账号。
2. 聚合当前用户的多个 QQ 邮箱账号，后台同步有限的 INBOX 元数据。
3. 支持账号范围切换、元数据搜索、稳定游标分页、按需正文和附件读取。
4. 正文成功读取后，以独立且可降级的 IMAP 会话同步远端已读状态。
5. 凭据、账号、索引和 API 全程按 OmniMail 用户隔离。
6. 任一 QQ 邮箱故障不能阻断其他 QQ 账号或其他邮件工作区。

首版完成的判定条件：自动化测试通过，并从实际部署的 Cloudflare Worker 使用专用测试 QQ
账号完成连接、首次同步、增量同步、正文、附件、已读、授权码失效和恢复的真实链路验证。

## 2. 范围假设与待确认决策

为避免开发时静默扩大范围，本计划采用以下默认决策：

| 决策项 | 推荐默认值 | 说明 |
| --- | --- | --- |
| 账号类型 | 仅个人 `@qq.com` | Foxmail 别名、VIP QQ 邮箱和腾讯企业邮箱需单独实测；企业邮箱服务器也不同 |
| 工作区 | 独立“QQ 邮箱”入口 | 不混入 OmniMail 主收件箱，也不做跨提供方总收件箱 |
| 账号数量 | 支持多账号，不预设产品上限 | 仍受 Worker、D1、Queue 和 QQ 反滥用容量约束 |
| 同步范围 | 仅 INBOX，有限元数据索引 | 不做全量历史镜像或完整文件夹树 |
| 远端修改 | 仅打开正文后尝试标记已读 | 不删除、移动、归档、星标或管理文件夹 |
| 发信 | 不进入首版 | SMTP 作为独立阶段，需再次确认范围和真实账号行为 |
| 客户端 | 仅 Web | Android 与浏览器扩展分别立项 |

实施前若产品希望支持 Foxmail/VIP/企业邮箱、首版发信或跨提供方聚合，应先修改本节和验收标准，
不能在编码过程中顺带加入。

## 3. 当前仓库基线与复用边界

仓库已有 Gmail 多账号聚合收件箱，可复用其产品流程和安全模式：

- 账号管理、聚合列表、账号范围、搜索、游标分页和阅读器交互。
- Queue/Cron 调度、账号租约、手动同步频率限制和错误状态模型。
- D1 仅保存账号状态与有限元数据，正文和附件按需读取。
- AES-GCM 凭据加密、用户归属校验、验证限速和审计日志脱敏。
- 通用 `ImapConnection` 的固定主机直连、命令超时、响应行、literal 和总响应上限。
- `postal-mime` 正文及附件解析、HTML 隔离和远程图片策略。

不能直接复用 Gmail 业务客户端或 Gmail 数据模型：

- `GmailImapClient` 强制要求 `X-GM-EXT-1`。
- Gmail 同步依赖 `X-GM-MSGID`、`X-GM-THRID` 和 `X-GM-LABELS`。
- Gmail 的稳定去重标识和搜索命令不属于通用 IMAP 能力。
- Gmail 的应用专用密码格式校验不应复制到 QQ 授权码。

推荐只提取已经被 QQ 与现有实现共同需要的最小能力，例如标准 IMAP FETCH 属性解析和 MIME
展示类型；账号、凭据、路由、表、同步状态和 UI 继续保持 QQ 专用。不要为了一个新增提供方先
重写完整的通用 provider 框架。

## 4. 与并行开发的协调约束

当前还有其他 agent 修改仓库。开始实施 QQ 接入前必须先基于当时最新工作树重新盘点一次，重点
检查迁移编号、队列 job union、公开配置、管理员工作区开关、侧栏导航、API 类型和可能新增的
通用 IMAP/SMTP 辅助模块。

协调规则：

1. 不复用尚未合并或未完成的文件名、迁移编号和接口约定。
2. 如果并行改动已经提供经过测试的 provider-neutral 原语，QQ 只复用所需最小部分。
3. 如果并行改动仍是 provider 专用实现，不为减少少量重复而做跨提供方大重构。
4. 先为 QQ 分配新的迁移编号，再开始表和类型修改，避免两个 agent 创建同号迁移。
5. 每个阶段提交前重新检查工作树，只暂存 QQ 接入直接相关的文件。

## 5. 阶段 0：真实协议与可用性验证

这是 go/no-go 阶段，业务实现必须等待它通过。准备一个专门联调、可撤销授权码的个人 QQ
邮箱账号，不使用 QQ 主密码，也不把凭据写入仓库、测试夹具、日志或截图。

### 5.1 实施时重新核对的服务参数

预期参数如下，但必须以实施当天 QQ 邮箱设置页和帮助中心显示的信息为准：

| 用途 | 预期参数 |
| --- | --- |
| IMAP | `imap.qq.com:993`，直接 TLS |
| SMTP（后续阶段） | `smtp.qq.com:465`，直接 TLS |
| 用户名 | 完整 `name@qq.com` 地址 |
| 密码字段 | QQ 邮箱生成的授权码，不是 QQ 登录密码 |

Cloudflare Workers 当前允许通过 `cloudflare:sockets` 发起出站 TCP；SMTP 25 端口被禁止，因此
后续发信也只能使用 QQ 官方支持且实测可用的加密提交端口。

### 5.2 最小验证矩阵

从实际部署的 Worker 发起临时、不可持久化凭据的验证：

1. 建立 `imap.qq.com:993` TLS 连接并记录脱敏后的连接结果。
2. 执行 `CAPABILITY`，确认实际支持的 IMAP 版本、认证方式和 `ID` 能力。
3. 使用授权码登录；根据能力和真实响应确认是否需要或允许 `ID` 命令。
4. 执行 `EXAMINE INBOX`，确认 `UIDVALIDITY`、`UIDNEXT` 和 `EXISTS` 的返回形式。
5. 使用严格受控且有界的 `UID SEARCH` / `UID FETCH` 读取少量中英文邮件头、Flags、
   `INTERNALDATE`、`RFC822.SIZE` 和 `BODYSTRUCTURE`。
6. 使用 `BODY.PEEK[]` 读取一封正文，确认不会因读取动作提前标记已读。
7. 在测试邮件上执行精确的 `UID STORE <uid> +FLAGS.SILENT (\Seen)`，确认已读同步行为。
8. 读取普通附件、中文文件名附件和内嵌图片，确认 MIME 与大小限制策略可用。
9. 连续执行首次同步、增量同步和短时间重复登录，观察 QQ 的异地登录、验证码、频率限制或
   风控提示。
10. 撤销授权码后重新登录，确认错误可稳定归类为凭据失效；生成新授权码后确认可恢复。

### 5.3 通过与停止条件

只有以下条件全部满足才进入业务实现：

- 生产 Worker 所在网络可稳定连接 QQ IMAP，不依赖本机特殊网络环境。
- QQ 没有要求无法在无交互 Worker 中完成的二次验证流程。
- 标准 IMAP 命令足以完成有限 INBOX 同步、正文、附件和已读。
- 错误响应可以在不记录服务端原文和邮箱内容的情况下归类。
- 登录和同步频率能够控制在 QQ 可接受范围内。

若 Cloudflare 出站地址持续触发 QQ 风控、授权流程要求交互确认，或 IMAP 行为无法形成稳定的
UID 一致性边界，应停止后续开发并记录实测结果，而不是加入代理、可配置主机或绕过风控逻辑。

## 6. 推荐架构

```text
Web QqMailWorkspace
  ├─ QqMailAccountDialog：连接、重命名、验证、更新授权码、断开
  ├─ QqMailScopeSwitcher：全部 QQ 邮箱 / 单账号
  ├─ QqMailSearchField：D1 元数据搜索
  ├─ 聚合列表与稳定 keyset 分页
  └─ QqMailReader：按需正文、附件与已读反馈

Worker /api/qq-mail
  ├─ qq-mail-api.ts：账号、列表、搜索、正文和附件 API
  ├─ qq-mail-store.ts：用户作用域数据访问与凭据解密
  ├─ qq-mail-imap.ts：固定 QQ IMAP 协议边界
  ├─ qq-mail-sync.ts：Queue/Cron 同步、租约和有限索引
  ├─ qq-mail-read-state.ts：独立、可降级的 \Seen 写入
  └─ provider-neutral MIME/FETCH helpers：仅在确有复用时提取

Cloudflare
  ├─ D1：QQ 账号、元数据索引、验证频率状态
  ├─ Queue：连接、手动和定时同步任务
  ├─ Cron：复用现有 5 分钟调度入口，筛选到期 QQ 账号
  └─ Worker Secret：QQ_MAIL_CREDENTIALS_KEY
```

QQ 邮件不写入主邮箱 `messages` 表，不把原始 MIME、正文或附件复制到 D1/R2。

## 7. 标准 IMAP 协议边界

### 7.1 固定连接参数

- 主机固定为 `imap.qq.com`。
- 端口固定为 `993`。
- 传输固定为直接 TLS，并使用运行时默认的证书校验。
- 用户不能提交主机、端口、代理、TLS 模式、证书策略或原始 IMAP 命令。

### 7.2 允许的业务命令

- `CAPABILITY`
- `LOGIN`，用户名和授权码必须使用现有严格 IMAP 引用
- 受控 `ID`，是否执行由阶段 0 实测决定，值由服务端代码固定
- `EXAMINE INBOX`
- `SELECT INBOX`，仅供已读写入会话使用
- 有界的 `UID SEARCH UID <start>:<end>`
- 有界且由服务端构造的 `UID FETCH`
- 精确的 `UID STORE <uid> +FLAGS.SILENT (\Seen)`
- `LOGOUT`

禁止 `APPEND`、`COPY`、`MOVE`、`EXPUNGE`、删除、任意 `STORE`、文件夹管理和原始命令透传。

### 7.3 消息身份与一致性

QQ 没有 Gmail 的 `X-GM-MSGID`。首版使用以下复合键标识 INBOX 中的远端邮件：

```text
account_id + uid_validity + imap_uid
```

`Message-ID` 只保存为展示、排查和未来线程功能的辅助字段，不能作为唯一键，因为它可能缺失、
重复或由不可靠发件方生成。`UIDVALIDITY` 变化时必须使该账号的旧 UID 映射整体失效并执行有限
重建，不能把新 UID 错配到旧正文。

## 8. D1 数据设计

使用 QQ 专用表，避免修改已经上线的 Gmail 表语义。实际迁移编号在并行工作合并后分配。

### 8.1 `qq_mail_accounts`

建议字段：

- `id`、`user_id`、`name`、`email`
- `authorization_code_cipher`
- `status`：`active | syncing | credential_error | error`
- `uid_validity`、`uid_next`、`last_seen_uid`
- `last_synced_at`、`next_sync_at`
- `last_error_code`、`last_error_at`
- `sync_lease_id`、`sync_lease_until`
- `last_manual_sync_at`、`created_at`、`updated_at`

约束和索引：

- `(user_id, email COLLATE NOCASE)` 唯一。
- 到期同步索引：`(next_sync_at, status, id)`。
- 用户账号索引：`(user_id, created_at, id)`。
- 不设置难以维护的 D1 账号数触发器；容量策略应由后续实测决定。

### 8.2 `qq_mail_messages`

建议字段：

- `id`、`account_id`、`imap_uid`、`uid_validity`
- `message_id_header`
- `sender_name`、`sender_address`、`recipients_json`、`cc_json`
- `subject`、`preview`、`internal_date`、`size_bytes`
- `flags_json`、`is_read`、`is_starred`、`has_attachments`
- `created_at`、`updated_at`

约束和索引：

- `(account_id, uid_validity, imap_uid)` 唯一。
- 单账号列表索引：`(account_id, internal_date DESC, id DESC)`。
- 跨账号聚合索引：`(internal_date DESC, id DESC, account_id)`。

### 8.3 `qq_mail_validation_limits`

沿用 Gmail 的验证限速模型，以 `user_id + IP` 的哈希身份为键，保存窗口开始时间、尝试次数和
更新时间。不要把完整 IP、邮箱或授权码写入此表。

## 9. 凭据与输入安全

- 新增独立 Secret `QQ_MAIL_CREDENTIALS_KEY`，至少 32 个 UTF-8 字节，不与 Gmail、iCloud
  或 Linux DO Mail 共用。
- 使用 AES-GCM，加密附加数据绑定 `user_id:account_id:qq-authorization-code`。
- API 字段命名为 `authorizationCode`，界面始终称“授权码”，避免用户误填 QQ 主密码。
- 实施阶段先依据官方页面和真实账号确认授权码格式；在此之前不要照搬 Gmail 的 16 位硬编码。
- 最低限度应去除首尾空白，拒绝 CR/LF、NUL 和控制字符，并设置保守的字节长度上限；最终以
  远端登录验证作为有效性判定。
- 邮箱地址规范化为小写并要求完整、合法且域名精确为 `qq.com`；不允许用户借此连接任意
  IMAP 服务。
- 新增或更新授权码时必须先远程验证再写入；验证失败不得插入账号或覆盖旧密文。
- API 只返回 `hasAuthorizationCode: true`，不得返回密文、掩码、长度或可逆片段。
- 所有账号、列表、正文和附件查询先使用当前 `user_id` 验证归属。
- 审计只记录动作、内部账号 ID 和脱敏地址；日志不记录授权码、服务器响应原文、主题、正文或
  附件名。

## 10. 同步方案

### 10.1 初始同步

推荐保持与 Gmail 当前产品体验相近，但避免无界的 `UID SEARCH ALL`：

1. 取得 6 分钟账号租约。
2. `EXAMINE INBOX` 并读取 `UIDVALIDITY`、`UIDNEXT` 和 `EXISTS`。
3. 从 `UIDNEXT` 向前按有限 UID 区间搜索，最多若干轮，收集最新 100 个实际存在的 UID。
4. 每批最多 20 个 UID，读取标准 header、Flags、`INTERNALDATE`、`RFC822.SIZE` 和
   `BODYSTRUCTURE`。
5. 在 D1 upsert 元数据，更新 `last_seen_uid`、`uid_next` 和同步时间。
6. 不下载完整正文或附件。

向前扫描的区间大小、最大轮数和总执行期限必须写成常量并覆盖边界测试。找不到 100 封时允许
返回较少结果，不能为了补足数量扫描整个超大邮箱。

### 10.2 增量同步

- Cron 复用当前 5 分钟触发器，但 QQ 使用自己的到期账号查询和单次入队上限。
- Queue job 使用独立 `kind: 'qq-mail-sync'`，并带 `accountId` 与触发原因。
- 根据上次游标和最新 `UIDNEXT` 分段扫描新 UID，每段和单次同步都有硬上限。
- 重新 FETCH 当前有限索引窗口中的 UID，以刷新 Flags 并识别已经移出 INBOX 的邮件。
- 每账号建议最多保留最近 500 封 INBOX 元数据；常量与 Gmail 相近，但不要共用表或隐式耦合。
- `UIDVALIDITY` 变化时删除该 QQ 账号旧索引并有限重建。
- 同一账号只允许一个租约；单账号失败不阻断其他任务。
- 临时网络错误有限退避并最多重试 3 次；凭据失效、响应超限和确定性协议错误不高频重试。

如果账号长期离线后新邮件数量超过单次扫描上限，应保留可继续推进的游标并分批追赶，同时在
界面显示“同步中”；不能一次构造超长 UID 列表或超大 D1 batch。

### 10.3 手动同步

- 单账号请求至少间隔 60 秒。
- API 在记录请求后返回 `202`，Queue 发送可由 `waitUntil()` 延后执行。
- Queue 发送失败时恢复到期状态，由 Cron 补偿。
- “同步全部 QQ 邮箱”由 Web 对当前可用账号逐个请求，部分失败不抹掉成功结果。

### 10.4 正文、附件与已读

- 正文使用 `BODY.PEEK[]` 按需读取，单封原始 MIME 上限建议沿用 10 MiB。
- 正文和附件不持久化；附件按需重新读取，单个下载上限建议沿用 5 MiB。
- 正文成功解析后，另开会话执行精确的 `SELECT INBOX` 和 `UID STORE ... (\Seen)`。
- 已读写入、D1 状态更新或关闭写入会话失败，都不能把已经成功取得的正文响应改成 500。
- UI 应明确提示“正文已打开，但 QQ 已读状态同步失败”，并允许重新打开重试。

## 11. API 草案

路径前缀推荐使用 `/api/qq-mail`，避免与 QQ 登录或其他腾讯能力混淆。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/qq-mail/accounts` | 返回功能状态和当前用户账号，不返回凭据 |
| `POST /api/qq-mail/accounts` | 验证 IMAP、加密保存账号并加入首次同步 |
| `PATCH /api/qq-mail/accounts/{id}` | 修改展示名称 |
| `PUT /api/qq-mail/accounts/{id}/authorization-code` | 验证成功后替换授权码 |
| `DELETE /api/qq-mail/accounts/{id}` | 删除本地账号、密文和索引 |
| `POST /api/qq-mail/accounts/{id}/verify` | 使用已保存授权码重新验证 |
| `POST /api/qq-mail/accounts/{id}/sync` | 受限请求异步同步 |
| `GET /api/qq-mail/messages` | 聚合列表、账号筛选、元数据搜索和 cursor 分页 |
| `GET /api/qq-mail/accounts/{accountId}/messages/{messageId}` | 按需正文并尝试同步已读 |
| `GET /api/qq-mail/accounts/{accountId}/messages/{messageId}/attachments/{partId}` | 下载受限附件 |

`POST /accounts` 请求草案：

```json
{
  "name": "个人 QQ 邮箱",
  "email": "123456789@qq.com",
  "authorizationCode": "由 QQ 邮箱生成的授权码"
}
```

列表查询参数与 Gmail 工作区保持一致：`accountId?`、`q?`、`limit?`、`cursor?`。搜索范围仅限
D1 已保存的发件人、收件人、抄送和主题元数据，界面不能暗示支持正文全文搜索。

## 12. Web、配置与运维计划

### 12.1 Web 工作区

- 左侧增加独立“QQ 邮箱”入口，并支持管理员控制入口是否显示。
- 添加账号时直接展示名称、完整邮箱和授权码表单，同时提供 QQ 邮箱官方设置/帮助入口。
- 明确提示先在 QQ 邮箱开启 IMAP/SMTP 服务并生成授权码，不要填写 QQ 主密码。
- 支持全部账号、单账号、账号状态、同步时间、同步、验证、更新授权码和断开。
- 复用 Gmail 工作区的视觉和响应式行为，但文案、类型和 API 保持 QQ 专用。
- 删除本地连接时提示：OmniMail 不会删除 QQ 邮件，也不会代替用户在 QQ 端撤销授权码。

### 12.2 功能开关

- `QQ_MAIL_CREDENTIALS_KEY`：凭据加密 Secret，未配置时功能不可连接。
- `QQ_MAIL_IMAP_ENABLED=false`：部署级紧急开关，隐藏入口并停止定时入队。
- `qqMailWorkspaceEnabled`：管理员产品入口开关，只隐藏入口，不删除账号或索引。

公开配置应区分“部署能力可用”和“管理员允许显示”，避免只隐藏 UI 而后台仍按错误配置运行。

### 12.3 可观测性与回滚

只记录不含邮件内容的指标：到期账号数、入队数、同步耗时、认证失败、连接失败、超限、租约冲突
和重试次数。邮箱、IP 和账号 ID 在日志中必须脱敏或使用内部标识。

紧急回滚顺序：

1. 将 `QQ_MAIL_IMAP_ENABLED=false`，停止入口和新定时任务。
2. 让已经消费中的任务自然结束；不要通过删除 D1 表中断。
3. 保留账号密文和索引，修复后可恢复；只有用户主动断开时才级联删除其数据。
4. D1 迁移保持前向兼容，不在回滚时执行破坏性 drop。

## 13. 测试计划

### 13.1 单元与 Worker 测试

- 授权码加密使用 QQ 专用密钥，并绑定用户、账号和字段上下文。
- 密钥不足 32 字节时功能禁用，且不读取账号表。
- 邮箱、账号名称、授权码和 CRLF/NUL 输入边界。
- 新连接远程验证失败不插入；更新验证失败不覆盖旧密文。
- API 响应、审计和错误不泄露授权码或服务端原始响应。
- `CAPABILITY`、可选 `ID`、`EXAMINE`、有界 SEARCH/FETCH、`BODY.PEEK` 和精确 Seen 命令。
- 缺少 Gmail 扩展字段时仍能工作，且不会发送 `X-GM-*` 命令。
- `UIDVALIDITY` 重置、UID 缺口、移出 INBOX、Flags 刷新和索引裁剪。
- 租约竞争、手动同步限速、Queue 补偿、临时重试与凭据错误不重试。
- 用户 A 不能列出、更新、同步、读取或删除用户 B 的 QQ 账号和邮件。
- MIME、中文头、HTML、内嵌图片、附件、超大正文和超大附件边界。
- 已读写入失败不阻断正文，且本地状态不会被错误标记为已读。

### 13.2 Web 与 E2E

- 未配置 Secret 时显示明确的部署恢复路径。
- 首个账号连接、多账号聚合、单账号切换和账号管理。
- 元数据搜索防抖、旧请求取消、分页保持账号与查询范围。
- 同步全部时部分账号失败，其他账号仍完成并刷新。
- 正文、附件、未读更新、已读失败提示和重试。
- 375 px 窄屏、键盘焦点、对话框语义、读屏标签和减少动态效果。
- 管理员入口开关隐藏后不删除已有账号和索引。

### 13.3 真实账号回归

至少覆盖：新授权码、撤销授权码、更新授权码、中英文主题、HTML、普通附件、内嵌图片、已读/未读、
邮件移出 INBOX、长时间未同步后追赶，以及 Cloudflare 部署环境连续运行 24 小时。

## 14. 分阶段实施顺序

### 阶段 A：并行改动对齐与协议验证

1. 等待当前并行修改形成稳定基线并重新检查工作树。
2. 分配迁移编号和文件命名。
3. 完成阶段 0 真实 Worker 验证并记录脱敏结果。

验收：阶段 0 全部通过；否则停止。

### 阶段 B：协议、凭据和存储

1. 先写 IMAP 命令边界、标准 FETCH 解析和授权码加密测试。
2. 实现最小 QQ IMAP 客户端与 QQ 专用类型。
3. 增加 D1 迁移和用户作用域 store。

验收：协议测试证明没有 `X-GM-*` 依赖；密文和用户隔离测试通过。

### 阶段 C：账号 API 与后台同步

1. 实现账号 CRUD、验证、更新授权码和手动同步。
2. 实现有限初始/增量同步、租约、Queue consumer 和 Cron 入队。
3. 实现聚合列表、搜索、正文、附件和最佳努力已读。

验收：Worker 测试覆盖成功、越权、超限、失效、重试和一致性路径。

### 阶段 D：Web、管理员开关与文档

1. 接入 API 类型和客户端。
2. 增加独立 Web 工作区、侧栏、响应式样式和英文翻译。
3. 增加管理员入口设置、公开配置、部署检查和审计展示。
4. 更新 README、API catalog、生成文档、部署说明和变更记录。

验收：组件测试、E2E、文档生成检查、类型检查和生产构建通过。

### 阶段 E：灰度与生产验证

1. 先部署迁移和 Worker，保持管理员入口关闭。
2. 用测试用户开启入口，完成真实账号回归和 24 小时同步观察。
3. 核对日志无凭据/内容泄露，Queue 无异常堆积，风控频率可接受。
4. 再决定是否面向所有用户开放入口。

验收：真实链路稳定，紧急开关和恢复流程实测有效。

## 15. 预计涉及的文件区域

以下仅用于未来实现导航，不表示本计划已经修改这些文件：

- 新迁移：`migrations/<next>_qq_mail_imap.sql`
- Worker：`email-worker/src/qq-mail-*.ts`
- 共用边界：`email-worker/src/imap-connection.ts` 和必要的最小 MIME/FETCH helper
- Queue/Cron：`email-worker/src/types.ts`、`mail.ts`、`cleanup.ts`
- 路由/配置：`email-worker/src/api.ts`、`public-config.ts`、`system-settings.ts`、
  `deployment-check.ts`
- Web API：`src/lib/api-types.ts`、`api-client.ts`、新的 `qq-mail-api-client.ts`
- Web UI：`src/components/QqMail*.tsx`、`MailboxSidebar.tsx`、`App.tsx`、管理员工作区设置
- 样式与翻译：`src/styles/qq-mail*.css`、QQ 专用英文翻译文件
- 测试：Worker 单测、组件测试和 `e2e/qq-mail-workspace.e2e.ts`
- 文档：README、API catalog、生成 API 文档、QQ 设置说明和 CHANGELOG

任何对现有 Gmail、iCloud 或 Linux DO Mail 文件的修改都必须能直接证明是 QQ 接入所需的最小
复用改动，并先用原提供方回归测试锁定行为。

## 16. 已实现阶段：QQ SMTP 发信

用户确认需要发信后已启动。发布前仍需通过真实账号重新核对 QQ 官方 SMTP 参数、发信额度、
反滥用规则、授权码权限和 Sent 行为。

建议边界：

- 固定 `smtp.qq.com:465` 直接 TLS，不允许自定义 SMTP 主机。
- 信封发件人和 `From` 固定为当前用户已经验证的 QQ 邮箱地址。
- 复用现有草稿、R2 正文/附件、发件 Queue、幂等键、用户限速和审计链路。
- 只提取 Linux DO SMTP 中真正通用的协议与 MIME 能力，保留 provider 专用错误映射。
- DATA 提交后的超时或断连标记为“投递结果不确定”，禁止自动重试造成重复邮件。
- 先实测是否自动保存 Sent；未确认前不增加 IMAP `APPEND` 权限。
- 首轮只允许单收件人，附件、CC/BCC、回复/转发按独立验收项逐步开放。

SMTP 阶段验收：真实 QQ 账号自发自收成功，发件人不可伪造，凭据失效和频率限制清晰，且不因
不确定投递自动产生重复邮件。

## 17. 明确不做

- QQ OAuth、扫码登录、代替用户生成授权码或保存 QQ 主密码。
- 腾讯企业邮箱、任意 IMAP/SMTP 服务商或用户自定义服务器。
- POP3、IMAP IDLE、实时推送、全量历史同步和离线正文镜像。
- 完整文件夹树、服务端全文搜索、线程 UI、移动、删除、归档和文件夹管理。
- 自动绕过 QQ 风控、验证码、异地登录保护或连接频率限制。
- 默认开放 Android、扩展、SMTP 或跨提供方统一收件箱。

## 18. 资料与实施时复核入口

- [QQ 邮箱](https://mail.qq.com/)
- [QQ 邮箱帮助中心](https://service.mail.qq.com/)
- [腾讯 QQ 邮箱产品页](https://www.tencent.net.cn/zh-cn/products/qq-mail/)
- [Cloudflare Workers TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)
- [现有 Gmail 接入基线](GMAIL_MULTI_ACCOUNT_INTEGRATION_PLAN.md)
- [现有 Gmail 设置说明](GMAIL_SETUP.md)
- [现有 API 说明](API.md)

QQ 邮箱帮助页面可能随账号界面、地区和登录方式变化。实施阶段应以测试账号内当时显示的官方
设置、服务器参数和授权码流程为准，并把验证日期及脱敏结果补回本计划。
