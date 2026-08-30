# NAVER Mail 接入计划

- 状态：方案研究完成；等待真实 NAVER 测试账号通过生产 Worker 链路验收
- 计划日期：2026-08-28
- 工作分支：`feature/naver-mail-integration-plan`
- 推荐首版：个人 `@naver.com` 邮箱、应用专用密码、独立多账号收件工作台
- 推荐协议：IMAP `imap.naver.com:993` 直接 TLS；SMTP 作为后续阶段使用
  `smtp.naver.com:587` STARTTLS
- 当前结论：Cloudflare 网络和协议握手可行，但真实认证与长期风控尚未验证

## 1. 目标与成功标准

在不影响 OmniMail 主邮箱及现有 iCloud、Gmail、Microsoft、QQ 和 Linux DO Mail 工作区的
前提下，允许当前登录用户连接自己有权访问的个人 NAVER Mail，并在独立工作区中完成：

1. 使用个人 `@naver.com` 地址和 NAVER 生成的应用专用密码验证并保存账号。
2. 聚合当前用户的多个 NAVER 账号，后台同步有限的 INBOX 元数据。
3. 支持账号范围切换、元数据搜索、稳定游标分页、按需正文和附件读取。
4. 正文成功读取后，使用独立且可降级的 IMAP 会话尝试同步远端已读状态。
5. 凭据、账号、索引、审计和 API 全程按 OmniMail 用户隔离。
6. 单个 NAVER 账号故障不能阻断其他账号或其他邮件工作区。

首版完成必须同时满足：

- 自动化测试和生产构建通过。
- 从实际部署的 Cloudflare Worker 使用专用测试账号完成真实 IMAP 全链路验收。
- 在至少 24 小时低频同步观察期内未持续触发 NAVER 异常登录或自动停用 IMAP。
- 凭据失效、网络断开和协议错误均能脱敏分类，且不会泄露应用专用密码。

SMTP 发信不作为 IMAP 首版完成条件。只有独立 SMTP 验收通过后才开放发信入口。

## 2. 官方要求与已确认参数

实施时必须再次以 NAVER 官方帮助中心为准。2026-08-28 调研结果如下：

| 项目 | 官方要求或参数 |
| --- | --- |
| 支持范围 | 本计划只支持个人 `@naver.com` 邮箱 |
| IMAP 主机 | `imap.naver.com` |
| IMAP 端口 | `993`，直接 SSL/TLS |
| SMTP 主机 | `smtp.naver.com` |
| SMTP 首选端口 | `587`，TLS/STARTTLS |
| SMTP 备选端口 | `465`，直接 SSL/TLS；只作为实测后的兼容方案 |
| IMAP/SMTP 开关 | 用户必须在 NAVER Mail 设置中启用 IMAP/SMTP |
| 账号安全 | 必须先开启 NAVER 两步验证 |
| 密码字段 | 必须使用应用专用密码，不能使用 NAVER 登录密码 |
| 用户名 | 官方客户端指南要求使用 NAVER ID；实现时由邮箱本地部分派生并实测确认 |

自 2025-11-19 起，NAVER 已结束旧登录密码的过渡期，POP3/IMAP/SMTP 连接需要两步验证和
应用专用密码。应用专用密码生成后不能再次查看；禁用两步验证会一并删除已生成的应用密码。

NAVER 还说明：如果连续 90 天存在异常登录尝试，或外部应用连接状态异常，IMAP/SMTP 可能被
自动改为停用。因此，阶段 0 必须从真实生产 Worker 验证动态出口 IP、重复登录频率和长期稳定性，
不能只依据本机测试判断可上线。

官方资料：

- [NAVER IMAP/SMTP 设置与停用](https://help.naver.com/service/30029/contents/21344?osType=COMMONOS)
- [NAVER IMAP/SMTP 故障检查与服务器参数](https://help.naver.com/service/30029/contents/21351?osType=COMMONOS)
- [NAVER 应用专用密码使用方法](https://help.naver.com/service/5640/contents/8584)
- [POP3/IMAP/SMTP 密码策略 FAQ](https://help.naver.com/service/30029/contents/24347)
- [NAVER Outlook IMAP/SMTP 配置示例](https://help.naver.com/service/30029/contents/21350?lang=ko&osType=PC)
- [NAVER SMTP 响应与限制说明](https://help.naver.com/service/30029/contents/21289?lang=ko&osType=COMMONOS)

## 3. Cloudflare 可行性结论

### 3.1 无凭据远程探测结果

2026-08-28 已从 Cloudflare Wrangler 远程预览环境执行不带账号和密码的协议探测：

| 探测项 | 结果 |
| --- | --- |
| `imap.naver.com:993` 直接 TLS | 成功 |
| IMAP greeting 与 `CAPABILITY` | 成功，声明 `IMAP4rev1` 和 `ID` |
| `smtp.naver.com:465` 直接 TLS + `EHLO` | 成功，声明认证能力 |
| `smtp.naver.com:587` 明文 greeting + `STARTTLS` + TLS 后 `EHLO` | 成功，声明认证能力 |

探测没有提交 NAVER ID、邮箱或应用专用密码，也没有部署生产 Worker。临时诊断文件和远程会话
已清理。

这证明 Cloudflare Workers 的 TCP/TLS 能力与 NAVER 公开端点兼容，但不能证明真实登录一定
通过。Cloudflare 说明 `connect()` 的出站 TCP 地址来自未包含在其公开 IP 列表中的地址前缀，
因此 NAVER 仍可能针对某些出口或地区触发风控。

- [Cloudflare TCP sockets 与 STARTTLS](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)

### 3.2 当前 go/no-go 判断

目前结论是“可以进入真实账号验证”，不是“可以直接开发上线”。只有阶段 0 全部通过后，才允许
增加 D1 表、API 和 UI。

如果真实 NAVER 应用密码在本机成功、但在 Cloudflare Worker 持续失败，处理方式应与网易问题
一致：停止纯 Worker 方案，另行评估固定出口连接器。不得加入用户自定义代理、任意 IMAP 主机、
关闭证书校验或绕过 NAVER 风控的代码。

## 4. 范围假设与产品决策

| 决策项 | 推荐默认值 | 说明 |
| --- | --- | --- |
| 账号类型 | 仅个人 `@naver.com` | NAVER Works、团体账号、企业域名需单独调研 |
| 工作区 | 独立“NAVER Mail”入口 | 不混入 OmniMail 主收件箱 |
| 多账号 | 支持 | 不预设产品上限，受同步和风控容量约束 |
| 同步范围 | 仅 INBOX，有限元数据 | 不做全量历史镜像或完整文件夹树 |
| 远端写操作 | 仅正文打开后尝试标记 `\Seen` | 不删除、移动、归档或管理文件夹 |
| 发信 | 第二阶段 | IMAP 稳定性验证通过后再开放 SMTP |
| 登录方式 | NAVER ID + 应用专用密码 | 不接收 NAVER 主密码，不做网页登录自动化 |
| 客户端 | 仅 Web | Android 与浏览器扩展分别立项 |

明确不在本计划范围内：

- 抓取或自动化操作 `https://mail.naver.com/` 网页。
- 保存 NAVER 登录主密码、代用户开启两步验证或生成应用密码。
- NAVER OAuth、联系人、日历、通讯录和 NAVER Works。
- 全文件夹同步、邮件移动/删除、草稿上传和任意 IMAP 命令透传。
- 绕过地区、IP、验证码、频率限制或其他 NAVER 安全策略。

## 5. 阶段 0：真实账号协议验证

这是强制 go/no-go 阶段。准备一个专门联调、可随时撤销应用密码的个人 NAVER 测试账号。
凭据只能通过交互式 Secret 或临时请求内存传入，不得写入仓库、命令历史、日志、截图、D1 或 R2。

### 5.1 用户侧准备

1. 在 NAVER 手机应用中开启两步验证。
2. 在 NAVER Mail PC 设置中启用 IMAP/SMTP。
3. 为 OmniMail 单独生成应用专用密码并当场保存。
4. 不复用已用于其他客户端的应用密码。
5. 准备可识别的普通邮件、HTML 邮件、中文/韩文主题、附件和内嵌图片样本。

### 5.2 IMAP 验证矩阵

从实际部署的测试 Worker 执行：

1. 建立 `imap.naver.com:993` TLS 连接，使用默认严格证书校验。
2. 读取 greeting 并执行 `CAPABILITY`。
3. 分别确认官方要求的 NAVER ID 登录形式；不要静默尝试多种用户名导致风控。
4. 使用应用专用密码执行一次 `LOGIN`。
5. 根据能力执行固定客户端信息的 `ID`，确认是否必需或允许。
6. `EXAMINE INBOX`，确认 `UIDVALIDITY`、`UIDNEXT`、`EXISTS` 返回形式。
7. 有界执行 `UID SEARCH` / `UID FETCH`，读取少量标准元数据。
8. 使用 `BODY.PEEK[]` 读取一封正文，确认不会提前标记已读。
9. 对专用测试邮件执行一次精确的 `UID STORE ... +FLAGS.SILENT (\Seen)`。
10. 验证普通附件、韩文/中文文件名、内嵌图片和 MIME 边界。
11. 撤销应用密码后确认错误可识别为凭据失效；新密码验证成功后确认可恢复。

### 5.3 稳定性验证

- 用建议的 15 分钟同步周期连续观察至少 24 小时。
- 记录脱敏错误类别、Cloudflare colo、耗时和成功率，不记录邮箱内容或服务端原文。
- 验证不同时间段的新 TCP 会话不会频繁触发异地登录或自动停用 IMAP。
- 手动同步限速至少 60 秒；稳定性测试不得用高频循环压测真实账号。
- 如果发生风控，停止自动重试并等待人工检查 NAVER 设置，避免放大异常登录次数。

### 5.4 SMTP 验证矩阵

IMAP 稳定后再执行：

1. 优先连接 `smtp.naver.com:587`，执行 `EHLO`、`STARTTLS`、TLS 后再次 `EHLO`。
2. 确认实际支持的认证机制，并使用应用专用密码登录。
3. 只向测试收件地址发送纯文本、HTML、回复和小附件样本。
4. 验证发件地址必须与登录账号一致；不支持任意 From。
5. 验证 `421` 临时错误、IP block、频率限制、`535` 凭据错误和投递结果不确定。
6. 仅当 587 在生产 Worker 不稳定且 NAVER 官方仍明确支持时，测试 465 直接 TLS 作为备选。

### 5.5 通过条件

只有以下条件全部满足才进入业务实现：

- 生产 Worker 能稳定完成 NAVER 应用专用密码登录，不依赖本机网络。
- 无法交互的 Worker 不需要验证码、推送确认或网页挑战。
- 标准 IMAP 足以完成有限 INBOX 同步、正文、附件和已读。
- 15 分钟周期运行不会持续触发 NAVER 风控。
- 错误可安全分类且无需把服务器原始响应返回前端。
- 若启用发信，SMTP 认证、限速和投递结果边界均已确认。

## 6. 推荐架构

```text
Web NaverMailWorkspace
  ├─ NaverMailAccountDialog：连接、验证、更新应用密码、断开
  ├─ NaverMailScopeSwitcher：全部 NAVER / 单账号
  ├─ NaverMailSearchField：D1 元数据搜索
  ├─ 聚合列表与稳定 keyset 分页
  └─ NaverMailReader：按需正文、附件与已读反馈

Worker /api/naver-mail
  ├─ naver-mail-account-api.ts：账号操作
  ├─ naver-mail-message-api.ts：列表、正文、附件
  ├─ naver-mail-credentials.ts：应用密码加解密
  ├─ naver-mail-imap.ts：固定 NAVER IMAP 协议
  ├─ naver-mail-store.ts：用户作用域数据访问
  ├─ naver-mail-sync.ts：Queue/Cron、租约和有限索引
  └─ naver-mail-smtp.ts：第二阶段受控 SMTP

Cloudflare
  ├─ D1：账号、有限元数据索引、验证频率状态
  ├─ Queue：连接、手动和定时同步任务
  ├─ Cron：复用现有调度入口，按 15 分钟账号周期筛选
  └─ Secret：NAVER_MAIL_CREDENTIALS_KEY
```

NAVER 邮件不写入主邮箱 `messages` 表。原始 MIME、正文和附件不复制到 D1 或 R2，正文与附件
按需从 NAVER 读取。

## 7. 现有代码复用与最小改动

### 7.1 可直接复用

- `platform/imap/ImapConnection`：固定主机 TLS、LOGIN、命令超时和响应大小上限。
- QQ Mail 的标准 IMAP 同步思路：UID、有限 SEARCH/FETCH、正文、附件和已读。
- provider-neutral MIME 解析和安全正文渲染。
- AES-GCM 凭据保护、用户归属校验、验证限速和审计脱敏模式。
- Queue/Cron、账号租约、手动同步节流和错误状态模式。
- 邮箱工作区的共享外壳、范围切换和阅读器基础组件。

### 7.2 不能直接复制

- Gmail 的 `X-GM-*` 扩展、线程和标签逻辑。
- QQ 的授权码字段名、域名校验、客户端 ID 文案和 SMTP 465 固定端点。
- NAVER 应用密码的长度/字符正则：官方未在当前资料中公布固定格式，不应猜测硬编码。
- Microsoft OAuth 或 iCloud Cookie 流程。

### 7.3 SMTP STARTTLS 最小扩展

当前共享 `ControlledSmtpClient` 固定使用直接 TLS，无法正确实现官方首选的 587 STARTTLS。第二阶段
只增加一个明确的传输选项：

```ts
transport: 'tls' | 'starttls'
```

`starttls` 流程必须是：明文连接 → greeting → EHLO → 确认 STARTTLS → STARTTLS 命令 →
`socket.startTls()` → 重建 reader/writer → 再次 EHLO → AUTH。QQ 和 Linux DO Mail 保持现有
`tls` 默认值，现有行为和测试不能改变。

## 8. 标准 IMAP 协议边界

- 主机固定为 `imap.naver.com`，端口固定为 `993`，直接 TLS。
- 邮箱域名固定为 `naver.com`；不允许用户提交主机、端口、代理或 TLS 模式。
- 用户名按官方说明从邮箱本地部分派生为 NAVER ID，最终以阶段 0 结果锁定。
- 允许命令：`CAPABILITY`、`LOGIN`、受控 `ID`、`EXAMINE INBOX`、受控 `SELECT INBOX`、
  有界 `UID SEARCH`、有界 `UID FETCH`、精确 Seen `UID STORE`、`LOGOUT`。
- 禁止 `APPEND`、`COPY`、`MOVE`、`EXPUNGE`、删除、任意 STORE、文件夹管理和原始命令透传。

邮件身份使用：

```text
account_id + uid_validity + imap_uid
```

`Message-ID` 仅为辅助字段，不能作为唯一键。`UIDVALIDITY` 变化时清除该账号旧 UID 索引并执行
有限重建，不能将新 UID 映射到旧正文。

## 9. D1 数据设计

使用 NAVER 专用表。迁移编号在真正开始实现时依据目标分支最新状态分配，本计划不预占编号，
避免与保留中的网易邮箱分支发生迁移号冲突。

### 9.1 `naver_mail_accounts`

建议字段：

- `id`、`user_id`、`name`、`email`、`naver_id`
- `app_password_cipher`
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

### 9.2 `naver_mail_messages`

保存有限 INBOX 元数据：账号、UID、UIDVALIDITY、Message-ID、发件人、收件人、抄送、主题、
预览、时间、大小、Flags、已读、星标和附件标记。

约束和索引：

- `(account_id, uid_validity, imap_uid)` 唯一。
- `(account_id, internal_date DESC, id DESC)` 用于单账号列表。
- `(internal_date DESC, id DESC, account_id)` 用于跨账号聚合。

### 9.3 `naver_mail_validation_limits`

沿用现有验证限速模型，以 `user_id + IP` 的哈希身份为键，只保存窗口、次数和更新时间。不得保存
完整 IP、NAVER ID、邮箱或应用专用密码。

## 10. 凭据和输入安全

- 新增独立 `NAVER_MAIL_CREDENTIALS_KEY`，至少 32 个 UTF-8 字节，不与其他 Provider 共用。
- 使用 AES-GCM，加密附加数据绑定 `user_id:account_id:naver-app-password`。
- API 字段使用 `appPassword`，界面始终称“应用专用密码”，明确禁止填写 NAVER 主密码。
- 不猜测固定长度或字符集；只去除首尾空白，拒绝 CR/LF、NUL、控制字符、空值和过大输入，
  最终以远端认证为准。
- API 只返回 `hasAppPassword: true`，不返回密文、掩码、长度或任何可逆片段。
- 新连接或更新凭据时先远端验证，成功后才写入；失败不得插入账号或覆盖旧密文。
- 所有账号、消息、正文、附件和发信操作先按当前 `user_id` 验证归属。
- 日志和审计不得记录应用密码、服务器原始响应、主题、正文或附件名。

## 11. 同步和读取策略

### 11.1 首次同步

1. 获取账号同步租约。
2. `EXAMINE INBOX` 并读取 UID 边界。
3. 从 `UIDNEXT` 向前按有限 UID 区间搜索，最多收集最新 100 封。
4. 每批最多 20 个 UID，读取标准元数据和 `BODYSTRUCTURE`。
5. Upsert D1 元数据，更新游标、同步时间和下次同步时间。
6. 不下载完整正文或附件。

### 11.2 增量同步

- NAVER 默认每账号 15 分钟同步一次，降低无状态 Worker 反复登录造成的风控风险。
- Queue job 使用独立 `kind: 'naver-mail-sync'`。
- 单次搜索、FETCH、保存数量和总执行时间都必须有硬上限。
- 每账号最多保留最近 500 封 INBOX 元数据，具体值在真实账号测试后确认。
- `UIDVALIDITY` 改变时有限重建；单账号失败不影响其他账号。
- 网络错误有限退避；认证失败、协议错误和超限错误不高频重试。
- 连接或认证疑似触发风控时暂停该账号自动同步，等待用户人工验证。

### 11.3 正文、附件与已读

- 正文用 `BODY.PEEK[]` 按需读取，原始 MIME 上限建议 10 MiB。
- 正文和附件不持久化；单附件下载上限建议 5 MiB。
- 正文成功后另开受控会话执行精确 Seen 写入。
- 已读同步失败不能把已成功获取的正文响应改成失败；UI 单独提示远端状态未同步。

## 12. API 草案

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/naver-mail/accounts` | 返回功能状态和当前用户账号，不返回凭据 |
| `POST /api/naver-mail/accounts` | 验证 IMAP、加密保存并加入首次同步 |
| `PATCH /api/naver-mail/accounts/{id}` | 修改展示名称 |
| `PUT /api/naver-mail/accounts/{id}/app-password` | 验证成功后替换应用专用密码 |
| `DELETE /api/naver-mail/accounts/{id}` | 删除本地账号、密文和索引 |
| `POST /api/naver-mail/accounts/{id}/verify` | 使用已保存凭据重新验证 |
| `POST /api/naver-mail/accounts/{id}/sync` | 受限请求异步同步 |
| `GET /api/naver-mail/messages` | 聚合列表、账号筛选、搜索和 cursor 分页 |
| `GET /api/naver-mail/accounts/{accountId}/messages/{messageId}` | 按需正文并尝试同步已读 |
| `GET /api/naver-mail/accounts/{accountId}/messages/{messageId}/attachments/{partId}` | 下载受限附件 |
| `POST /api/naver-mail/accounts/{accountId}/messages` | 第二阶段受控 SMTP 发信 |

连接请求草案：

```json
{
  "name": "Personal NAVER Mail",
  "email": "owner@naver.com",
  "appPassword": "NAVER 生成的应用专用密码"
}
```

消息搜索仅覆盖 D1 已保存的发件人、收件人、抄送和主题元数据，不暗示支持正文全文搜索。

## 13. Web、配置与运维

### 13.1 Web 工作区

- 左侧增加独立“NAVER Mail”入口，并支持管理员单独隐藏。
- 连接表单展示名称、完整邮箱和应用专用密码。
- 提供官方两步验证、应用密码和 IMAP/SMTP 设置链接。
- 明确三步前提：开启两步验证 → 开启 IMAP/SMTP → 生成应用专用密码。
- 支持全部账号、单账号、状态、同步时间、同步、验证、更新密码和断开。
- 删除本地连接时提示用户仍需前往 NAVER 删除对应应用密码。
- 中文为主界面文案，同时补齐英文 i18n；不直接混用未翻译韩文错误。

### 13.2 功能开关

- `NAVER_MAIL_CREDENTIALS_KEY`：凭据加密 Secret，缺失时不可连接。
- `NAVER_MAIL_IMAP_ENABLED=false`：紧急关闭入口和新同步任务。
- `naverMailWorkspaceEnabled`：管理员产品入口开关，只控制展示，不删除数据。

公开配置必须区分部署能力是否可用和管理员是否允许显示。

### 13.3 错误分类

建议至少包括：

- `authentication_failed`
- `imap_disabled`
- `connection_failed`
- `timeout`
- `protocol_error`
- `response_too_large`
- `credential_key_unavailable`
- `credential_decryption_failed`
- `rate_limited`
- `ip_blocked`
- `delivery_uncertain`（SMTP）

前端不得展示 NAVER 原始协议响应。管理员日志只记录内部账号 ID、错误类别、阶段、耗时和 Cloudflare
区域，不记录用户凭据或邮件内容。

### 13.4 回滚

1. 设置 `NAVER_MAIL_IMAP_ENABLED=false`，停止入口和新任务。
2. 让已消费任务自然结束，不删除 D1 表中断执行。
3. 保留账号密文和索引，修复后可恢复；用户主动断开时才级联删除。
4. D1 迁移保持前向兼容，回滚 Worker 时不执行破坏性 DROP。

## 14. 测试计划

### 14.1 单元与 Worker 测试

- NAVER 专用密钥、AES-GCM 上下文绑定和错误密钥解密失败。
- 邮箱、名称、应用密码、CRLF/NUL 和超长输入边界。
- 官方 NAVER ID 派生和仅 `naver.com` 域名限制。
- 新连接失败不插入；更新失败不覆盖旧密文。
- API、审计和日志不泄露凭据或服务端响应。
- 标准 IMAP CAPABILITY、可选 ID、EXAMINE、有界 SEARCH/FETCH、BODY.PEEK 和 Seen。
- UIDVALIDITY 重置、UID 缺口、移出 INBOX、Flags 刷新和索引裁剪。
- 租约竞争、15 分钟调度、手动同步限速、Queue 补偿和有限重试。
- 用户 A 不能操作用户 B 的 NAVER 账号和邮件。
- 韩文/中文头、HTML、内嵌图片、附件和超大响应。
- STARTTLS 状态机、TLS 升级后重新 EHLO、认证与错误分类。
- QQ/Linux DO SMTP 继续使用直接 TLS，现有测试行为不变。

### 14.2 API、UI 与 E2E

- 未登录、缺少 Secret、管理员隐藏和部署紧急开关。
- 连接、重复账号、重命名、验证、更新凭据、同步和断开。
- 多账号聚合、筛选、搜索、稳定 cursor 和部分账号失败。
- 正文、附件、已读成功及已读失败降级提示。
- 应用密码只可提交，不会通过 DOM、URL、Toast 或 API 响应回显。
- 桌面和移动布局、键盘操作、焦点、错误提示和中英文文案。

### 14.3 验证命令

```bash
npm run docs:api
npm run check
npm test
npm run test:worker
npm run build
npm run test:e2e -- e2e/naver-mail-workspace.e2e.ts
```

任何自动化测试都不能连接真实 NAVER；真实账号只用于阶段 0 和发布验收。

## 15. 分阶段实施顺序

### 阶段 A：真实协议闸门

- 使用专用测试账号完成 IMAP、24 小时稳定性和应用密码撤销/恢复验证。
- 输出脱敏测试记录，决定继续纯 Worker 或停止。
- 不创建业务表，不开放用户入口。

### 阶段 B：只读 IMAP MVP

- 新增 NAVER 专用迁移、凭据、账号、同步、消息 API 和 Web 工作区。
- 仅有限 INBOX、按需正文/附件和可降级 Seen。
- 功能开关默认关闭，测试环境先验收。

### 阶段 C：生产灰度

- 先允许管理员测试账号，再逐步开放入口。
- 观察认证失败、IP 风控、同步耗时、Queue 重试和 D1 写入。
- 达到暂停阈值时自动停止问题账号，而非持续重试。

### 阶段 D：SMTP 发信

- 扩展共享 SMTP 客户端支持 STARTTLS。
- 完成 587 真实发送、限速、固定 From、附件和投递不确定测试。
- SMTP 能力通过独立开关开放，不与 IMAP 上线捆绑。

### 阶段 E：文档与发布

- 新增 `docs/NAVER_MAIL_SETUP.md`、API 文档、README 和 CHANGELOG。
- 记录 NAVER 两步验证、应用密码、IMAP 开关、撤销方式和风控提示。
- 完成生产健康检查和版本回滚演练后再申请合并。

## 16. 合并前检查清单

- [ ] 使用 NAVER 专用测试账号完成生产 Worker 真实 IMAP 登录。
- [ ] 完成至少 24 小时低频稳定性观察。
- [ ] 确认 NAVER ID 的登录格式和 `ID` 命令行为。
- [ ] 确认 UID、MIME、附件、韩文/中文内容和 Seen 行为。
- [ ] 确认应用密码撤销、恢复和两步验证关闭后的错误分类。
- [ ] 所有凭据只以 Secret/密文存在，API、日志、审计和 UI 不泄露。
- [ ] D1 迁移编号未与其他保留分支冲突，且回滚不 DROP 数据。
- [ ] 同步、租约、限速、风控暂停和跨用户隔离测试通过。
- [ ] SMTP 若开放，587 STARTTLS 和投递不确定语义通过真实验收。
- [ ] `npm run check`、测试、构建和 NAVER E2E 全部通过。
- [ ] 功能分支经人工验证后才合并；不得直接在 `main` 上开发或部署。

## 17. 最终建议

NAVER Mail 值得继续推进。与网易邮箱不同，Cloudflare 远程环境已经完成 IMAP 和两种 SMTP
加密握手，官方也明确提供应用专用密码，技术路径清晰。当前唯一不能跳过的不确定性是：真实应用
密码从 Cloudflare 动态 TCP 出口登录时是否长期稳定。

因此推荐先完成阶段 A，再决定是否编写业务代码。若阶段 A 通过，首版应保持“个人
`@naver.com` + 有限 INBOX + 按需正文/附件”的最小范围；SMTP 独立后置。若阶段 A 失败，保留
本计划和脱敏测试结论，不把不稳定功能合并到 `main`。
