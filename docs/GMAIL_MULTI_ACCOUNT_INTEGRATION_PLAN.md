# Gmail 多账号聚合收件箱：当前实现基线与后续计划

- 状态：MVP 已实现、已在当前 Cloudflare 实例部署，并使用真实个人 Gmail 完成生产验证
- 基线日期：2026-08-24
- 接入方式：Gmail 应用专用密码 + `imap.gmail.com:993` 直接 TLS
- 产品范围：独立 Gmail 工作区；多账号聚合、元数据搜索、按需正文与附件、打开后同步已读

本文已从实施前计划更新为当前代码基线。描述与仓库现有迁移、Worker、Web UI 和测试保持一致；
“剩余工作”只列尚未完成或仍需扩大验证的内容。

## 当前结论

OmniMail 继续采用应用专用密码和受控 IMAP，而不要求每个自托管部署创建 Google Cloud Project、
OAuth Client、redirect URI 或中心 OAuth 中转服务。用户为每个 Gmail 账号生成独立应用密码，
OmniMail 在当前部署内加密保存，并只连接固定的 Gmail IMAP 地址。

Gmail 邮件不写入 OmniMail 自有域邮箱的 `messages` 表，也不与主收件箱、iCloud 或
Linux DO Mail 混合。Web 端提供独立的“Gmail 邮箱”入口，支持“全部 Gmail”和单账号范围。

当前远端操作边界为：

- 后台读取 INBOX 元数据并维护有限 D1 索引。
- 用户按需读取单封正文和下载受限大小的附件。
- 用户成功打开正文后，只允许为该邮件写入 `\Seen`。
- 不星标、不归档、不移动、不删除、不发信，不开放任意 IMAP 命令。

应用专用密码本身没有 OAuth scope，并不天然只读。实际安全边界由固定服务器、命令白名单、
凭据加密、用户归属检查和日志脱敏共同保证。

## 已实现能力

### 多账号与账号管理

- 同一 OmniMail 用户可以连接多个个人 Gmail 或 Google Workspace Gmail 账号。
- 当前没有应用层硬编码的账号数量上限；迁移 `0026_gmail_unlimited_accounts.sql` 已删除旧的
  5 账号 D1 触发器。
- 同一用户不能重复连接相同邮箱，`(user_id, email)` 使用大小写不敏感唯一约束。
- 支持添加、重命名、验证连接、手动同步、更新应用专用密码和断开连接。
- 账号列表显示状态、邮箱和最后同步时间；具体操作进入单账号管理页。
- 断开账号会级联删除本地密文和 Gmail 元数据索引，但不会撤销 Google 端应用密码。

### 连接流程

添加账号时直接进入连接表单，不再显示独立的前置引导页。表单包含：

- 账号备注名称。
- 完整 Gmail / Workspace 邮箱地址。
- Google 生成的 16 位应用专用密码。
- 左侧“创建 Google 应用密码”官方入口。
- 右侧“验证并连接”主操作。

应用密码允许粘贴 Google 展示的空格分组格式；服务端只移除普通空格，并要求去空格后恰好为
16 个可打印 ASCII 字符。连接前会进行真实 IMAP 登录验证，失败不会保存密文。

### 聚合收件箱

- “全部 Gmail”按 `internal_date DESC, id DESC` 聚合所有已连接账号。
- 可切换到单个 Gmail 账号，分页和搜索范围随当前选择变化。
- 每封邮件显示来源账号、发件人、主题、时间、未读状态和附件标识。
- 使用稳定 keyset cursor 分页，默认每页 30 封，接口允许 1–50 封。
- “加载更多”仅在滚动到当前已加载列表末尾时可见。
- 列表、阅读器和完整 HTML 邮件已做桌面/窄屏适配；固定宽邮件会缩放到阅读区域内。

### Gmail 元数据搜索

搜索框与 iCloud 邮箱保持相同的视觉和交互位置，输入后 300 ms 防抖并自动请求服务端。

当前搜索范围为 D1 已索引元数据：

- 发件人名称和地址。
- 收件人和抄送地址。
- 邮件主题。

搜索使用 `instr(lower(field), query) > 0` 做字面子串匹配，`%` 和 `_` 不作为通配符。
新请求会取消旧请求；取消不会显示错误。搜索分页继续携带相同 `q` 和账号范围。

当前不搜索完整正文。Gmail 同步只索引 header 元数据，正文在用户打开时按需读取且不持久化，
因此界面文案明确为“搜索发件人、收件人或主题”。

### 正文、已读与附件

- 正文先通过独立 IMAP 读取会话使用 `BODY.PEEK[]` 获取，读取本身不会提前改变远端状态。
- MIME 由 `postal-mime` 解析；HTML 在受限 iframe 中显示，并复用远程图片策略。
- 正文成功读取后，再使用独立、可降级的 IMAP 会话执行：

  ```imap
  SELECT INBOX
  UID STORE <uid> +FLAGS.SILENT (\Seen)
  ```

- 已读写入失败、状态持久化失败或写入会话关闭失败，都不能让已取得的正文接口变成 500。
- Gmail 写入成功后更新 D1 的 `is_read`，前端同步移除未读标记。
- 附件按需重新读取并转发，单个附件最大 5 MiB；不写入 D1 或 R2。
- 单封远程 MIME 读取上限为 10 MiB，IMAP 总响应另有独立安全上限。

## 实际架构

```text
Web GmailWorkspace
  ├─ GmailAccountDialog：连接和账号管理
  ├─ GmailScopeSwitcher：全部账号 / 单账号
  ├─ GmailSearchField：D1 元数据搜索
  ├─ 聚合列表与 keyset 分页
  └─ GmailReader：按需正文、附件与响应式 HTML

Worker /api/gmail
  ├─ gmail-api.ts：账号、列表、搜索、正文和附件 API
  ├─ gmail-store.ts：用户作用域数据访问与凭据解密
  ├─ gmail-imap.ts：固定 Gmail IMAP 协议边界
  ├─ gmail-sync.ts：Queue/Cron 同步、租约和有限索引
  ├─ gmail-read-state.ts：独立、可降级的 \Seen 写入
  └─ gmail-message-parser.ts：header/MIME/附件解析

Cloudflare
  ├─ D1：账号、元数据索引、验证频率状态
  ├─ Queue：连接、手动和定时同步任务
  ├─ Cron：每 5 分钟筛选到期账号
  └─ Worker Secrets：GMAIL_CREDENTIALS_KEY
```

## IMAP 协议边界

### 固定连接参数

- 主机：`imap.gmail.com`
- 端口：`993`
- 传输：直接 TLS
- 用户名：完整 Gmail 或 Workspace 邮箱地址
- 密码：应用专用密码

普通用户不能修改服务器、端口、TLS、代理或证书策略，避免 SSRF 和任意 TCP 代理能力。

### 当前业务命令

- `CAPABILITY`
- `LOGIN`（值经过严格 IMAP 引用）
- `ID`
- `EXAMINE INBOX`
- `SELECT INBOX`（仅已读写入会话）
- 受控 `UID SEARCH`
- 受控 `UID FETCH`
- 精确 `UID STORE <uid> +FLAGS.SILENT (\Seen)`
- `LOGOUT`

不支持 `COPY`、`MOVE`、`EXPUNGE`、`APPEND`、任意 `STORE`、邮箱管理或原始命令透传。
连接、命令、响应行、literal、单封邮件和总响应均有独立上限与超时。

### Gmail 扩展字段

同步要求服务器提供 `X-GM-EXT-1`，并保存：

- `X-GM-MSGID`：账号内稳定消息 ID，与 `account_id` 组成去重边界。
- `X-GM-THRID`：Gmail 线程 ID；当前只保存，不实现线程 UI。
- `X-GM-LABELS`：标签快照；当前只同步 INBOX，不提供标签树操作。

## 同步与一致性

### 初始同步

连接成功后向 Queue 发送同步任务：

1. 获取 6 分钟账号租约。
2. `EXAMINE INBOX` 并读取 `UIDVALIDITY`。
3. 首次或 UIDVALIDITY 变化时，搜索全部 UID，仅取最新 100 封。
4. 分批获取 header、Gmail 扩展字段、Flags、时间、大小和附件结构。
5. 在 D1 中 upsert 元数据并更新账号游标。

初始同步不下载完整正文或附件。

### 增量同步

- Cron 每 5 分钟运行，单次最多筛选 50 个到期账号并错峰入队。
- 正常账号下次同步时间为成功时间后 5 分钟。
- 通过 `last_seen_uid` 搜索新 UID，同时重新读取本地窗口内 UID 的 Flags/标签。
- 已不在 INBOX 返回中的近期 UID 从本地 Gmail 索引删除。
- 每账号最多保留最近 500 封 INBOX 元数据。
- UIDVALIDITY 变化时删除该账号旧 UID 映射并执行有限重建。
- Queue 临时失败最多重试 3 次，使用有限退避；认证、扩展或超限错误不高频重试。
- 同一账号只允许一个同步租约；单账号失败不会阻断其他账号。

### 手动同步

- 用户可以同步当前账号或“全部 Gmail”中的可用账号。
- 同一账号手动同步请求至少间隔 60 秒。
- API 在 D1 记录请求后立即返回 `202`，Queue 发送通过 `waitUntil()` 在响应后执行；若发送
  延迟或失败，保留的到期状态会由 Cron 补偿入队。
- Web 会轮询账号状态并在同步完成后刷新当前搜索/账号范围的列表。

## D1 数据模型与迁移

### `0025_gmail_imap.sql`

创建：

- `gmail_imap_accounts`
- `gmail_imap_messages`
- `gmail_imap_validation_limits`
- 到期账号、用户账号和跨账号日期索引
- `(user_id, email)`、`(account_id, gmail_message_id)`、
  `(account_id, uid_validity, imap_uid)` 唯一约束

该历史迁移最初包含每用户 5 账号触发器。

### `0026_gmail_unlimited_accounts.sql`

删除旧触发器：

```sql
DROP TRIGGER IF EXISTS gmail_imap_accounts_limit;
```

当前 API、Web 和 D1 都不再返回或执行 `accountLimit`。实际可连接数量仍受部署者的 Worker、
D1、Queue、Gmail 连接频率和运维容量约束。

### 持久化边界

D1 保存账号状态、加密凭据和最多 500 封列表元数据。不会保存：

- 原始 MIME。
- 纯文本或 HTML 正文。
- 内嵌图片内容。
- 附件内容。

## 凭据与用户隔离

- `GMAIL_CREDENTIALS_KEY` 必须是至少 32 字节的独立 Worker Secret。
- 应用密码使用 AES-GCM；附加数据绑定 `user_id:account_id:app-password`。
- API 只返回 `hasAppPassword: true`，不返回密文、掩码或可逆片段。
- 添加和更新密码都先验证新凭据，验证失败不保存、不覆盖旧密文。
- 凭据验证按 `user_id + IP` 哈希身份限制为每 10 分钟最多 5 次。
- 所有账号、列表、正文和附件查询都先带当前 `user_id` 验证归属。
- 固定 Gmail 主机和协议，拒绝 CR/LF、NUL 及不安全登录输入。
- 审计只记录动作、内部账号 ID 和脱敏邮箱；日志不记录密码、正文、主题或附件名。

## 当前 API

| 方法与路径 | 当前用途 |
| --- | --- |
| `GET /api/gmail/accounts` | 返回功能状态和当前用户账号，不返回凭据或账号上限 |
| `POST /api/gmail/accounts` | 验证 IMAP、保存账号并加入首次同步 |
| `PATCH /api/gmail/accounts/{id}` | 修改展示名称 |
| `PUT /api/gmail/accounts/{id}/app-password` | 验证成功后替换应用密码 |
| `DELETE /api/gmail/accounts/{id}` | 删除本地账号、密文和索引 |
| `POST /api/gmail/accounts/{id}/verify` | 验证已保存凭据并恢复账号状态 |
| `POST /api/gmail/accounts/{id}/sync` | 以 60 秒频率限制请求手动同步 |
| `GET /api/gmail/messages` | 聚合列表、账号筛选、`q` 元数据搜索和 cursor 分页 |
| `GET /api/gmail/accounts/{accountId}/messages/{messageId}` | 按需读取正文并尝试同步已读 |
| `GET /api/gmail/accounts/{accountId}/messages/{messageId}/attachments/{partId}` | 按需读取最大 5 MiB 附件 |

列表查询参数：

| 参数 | 说明 |
| --- | --- |
| `accountId` | 可选；为空表示全部已连接 Gmail |
| `q` | 可选；最多 120 字符，搜索发件人、收件人、抄送和主题 |
| `limit` | 可选；1–50，Web 默认 30 |
| `cursor` | 可选；由上一页返回的稳定 keyset cursor |

完整请求与响应说明见 [`API.md`](API.md) 和 [`api/gmail.md`](api/gmail.md)。

## 功能开关与部署

启用条件：

1. 配置至少 32 字节的 `GMAIL_CREDENTIALS_KEY`。
2. 应用 D1 迁移至 `0026_gmail_unlimited_accounts.sql`。
3. 部署 Worker 静态资源、Queue consumer 和 5 分钟 Cron。

可选将 `GMAIL_IMAP_ENABLED=false` 作为紧急开关；该值会隐藏入口并停止定时 Gmail 入队。
部署与用户操作说明见 [`GMAIL_SETUP.md`](GMAIL_SETUP.md)。

## 验证状态

### 已验证

- 真实个人 Gmail 的应用密码登录、首次同步和定时同步。
- Gmail 扩展字段、中文/HTML 邮件正文和附件读取。
- 打开正文后同步 `\Seen`，且写入失败不阻断正文。
- 聚合列表、单账号切换、末尾加载更多和元数据搜索。
- 固定宽 HTML 邮件在桌面和窄屏阅读区内缩放。
- 生产 Cloudflare Worker 中搜索和正文请求返回 200。
- 撤销之外的账号管理流程：连接、重命名、验证、更新密码、同步、断开。

### 自动化基线

当前仓库验证包括：

- `npm test`：106 个测试文件、461 项测试。
- `npm run test:worker`：3 个 Worker 测试文件、10 项测试。
- `npm run check`：文件行数、Web/Worker/集成 TypeScript 检查。
- `npm run build`：生产 Vite 构建。
- `e2e/gmail-workspace.e2e.ts`：连接流程、双账号聚合与范围切换、部分同步失败、搜索、
  同步、分页、已读、附件、宽邮件和 375 px 响应式边界。

测试数量会随仓库演进变化；以上是本基线日期的结果，不应替代后续真实账号回归。

## 当前限制与暂不支持

- 只同步 Gmail INBOX；不提供 All Mail、Sent、Spam、Trash 或自定义标签树。
- 元数据搜索不搜索正文，也不支持 Gmail 完整搜索语法。
- 不提供星标、归档、移动、删除、回复、转发、草稿、SMTP 发信或 Send As。
- 不提供 Gmail API、Google OAuth、Pub/Sub 或中心 OAuth 中转服务。
- 无法创建应用专用密码的账号目前不能接入。
- Google Workspace 管理员策略的允许/禁止组合尚未完成生产级覆盖验证。
- 尚未完成“撤销应用密码后”的长期状态和恢复流程实测矩阵。
- 不提供 Gmail 全历史或离线镜像；索引窗口固定为每账号最近 500 封。
- 不与 OmniMail、iCloud、Linux DO Mail 合成跨提供方总收件箱。
- Android 和浏览器扩展尚未接入 Gmail 工作区。
- 没有业务层账号硬上限，但尚未完成大量账号长期容量和连接尖峰压测。

## 剩余工作

按当前实现，后续工作优先级为：

1. 使用可获得的 Workspace 账号验证组织允许、禁止 IMAP/应用密码时的稳定错误行为。
2. 验证 Google 主密码变化和手动撤销应用密码后的状态、提示和恢复流程。
3. 对大量账号、Queue 堆积、Gmail 限流和 Worker socket 峰值进行容量测试。
4. 增加不含邮件内容的聚合可观测性：同步延迟、账号状态、认证失败、Queue 重试和租约冲突。
5. 若未来确有需求，单独设计 OAuth 兼容、正文全文索引或跨提供方统一收件箱；不在当前
   IMAP MVP 中顺带扩展。

## 关键实现文件

- [`../migrations/0025_gmail_imap.sql`](../migrations/0025_gmail_imap.sql)
- [`../migrations/0026_gmail_unlimited_accounts.sql`](../migrations/0026_gmail_unlimited_accounts.sql)
- [`../email-worker/src/features/gmail/gmail-api.ts`](../email-worker/src/features/gmail/gmail-api.ts)
- [`../email-worker/src/features/gmail/gmail-store.ts`](../email-worker/src/features/gmail/gmail-store.ts)
- [`../email-worker/src/features/gmail/gmail-imap.ts`](../email-worker/src/features/gmail/gmail-imap.ts)
- [`../email-worker/src/features/gmail/gmail-sync.ts`](../email-worker/src/features/gmail/gmail-sync.ts)
- [`../email-worker/src/features/gmail/gmail-read-state.ts`](../email-worker/src/features/gmail/gmail-read-state.ts)
- [`../email-worker/src/features/gmail/gmail-message-parser.ts`](../email-worker/src/features/gmail/gmail-message-parser.ts)
- [`../src/features/gmail/components/GmailWorkspace.tsx`](../src/features/gmail/components/GmailWorkspace.tsx)
- [`../src/features/gmail/components/GmailAccountDialog.tsx`](../src/features/gmail/components/GmailAccountDialog.tsx)
- [`../src/features/gmail/components/GmailSearchField.tsx`](../src/features/gmail/components/GmailSearchField.tsx)
- [`GMAIL_SETUP.md`](GMAIL_SETUP.md)
- [`API.md`](API.md)

## 方案边界说明

应用专用密码 + IMAP 仍是当前自托管模型下的实现选择：无需每个部署者配置 Google Cloud，
也不要求 OmniMail 维护者运营集中授权服务。代价是凭据权限较宽、部分账号不可用，并且只能
通过轮询获得最终一致。

若 Google 将来限制应用专用密码，或产品需要精细 scope、Gmail 历史游标、Pub/Sub、标签写入
和完整搜索语法，应将 Gmail API OAuth 作为新的独立方案设计，而不是在现有 IMAP 凭据模型中
隐式扩权。

## 官方资料

- [Google 应用专用密码说明](https://support.google.com/accounts/answer/185833)
- [在其他邮件客户端中添加 Gmail](https://support.google.com/mail/answer/75726)
- [Gmail IMAP 扩展](https://developers.google.com/workspace/gmail/imap/imap-extensions)
- [Gmail IMAP 客户端建议](https://support.google.com/mail/answer/78892)
- [Google Advanced Protection 与应用密码限制](https://support.google.com/accounts/answer/7539956)
