# Yandex Mail 接入计划

- 状态：官方协议与现有架构评估完成；等待生产 Worker 真实账号验证
- 计划日期：2026-08-28
- 推荐工作分支：`feature/yandex-mail-integration`
- 推荐首版：个人 Yandex Mail、Mail 类型应用密码、独立多账号只读 IMAP 工作区
- 当前结论：可以进入协议验证阶段；验证通过前不创建 D1 表、不合入用户入口

`mail.yandex.com` 是 Yandex Mail 的 Web 入口，不是用户邮箱地址的固定后缀。本计划首版面向
个人 Yandex Mail 账号；Yandex 360 企业自定义域名和共享邮箱的登录规则不同，后置单独验证。

## 1. 目标与成功标准

在不影响 OmniMail 主收件箱及现有 iCloud、Gmail、Microsoft、QQ、NAVER 和 Linux DO Mail
工作区的前提下，允许用户连接自己有权访问的个人 Yandex Mail，并完成：

1. 使用 Yandex 邮箱地址和为“邮件”创建的应用密码验证账号。
2. 在独立工作区聚合当前用户的多个 Yandex 账号。
3. 后台同步有限的 INBOX 元数据，支持账号筛选、搜索和稳定游标分页。
4. 按需读取正文和附件；正文成功读取后可降级地同步远端 `\Seen`。
5. 对凭据、账号、索引、API、Queue 任务和审计执行严格用户隔离。
6. 单个账号失败不能阻塞其他 Yandex 账号或其他邮箱 Provider。

首版完成必须满足：

- 实际 Cloudflare Worker 能稳定连接 Yandex IMAP，并用专用测试账号完成认证。
- 完成至少 24 小时低频同步观察，不持续触发验证码、账号保护或协议停用。
- 同步范围、响应大小、执行时间和租约有硬上限，不出现永久 `syncing`。
- 凭据和远端错误全程脱敏，自动化测试、构建和生产验收全部通过。

SMTP 发信、OAuth、企业邮箱和共享邮箱均不作为首版完成条件。

## 2. 官方要求与已确认参数

2026-08-28 调研结果如下；实施和发布时必须再次核对官方文档：

| 项目 | 官方参数或要求 |
| --- | --- |
| IMAP 主机 | `imap.yandex.com`；Yandex 对俄罗斯境外还提供 `imap.ya.ru` |
| IMAP 端口 | `993`，直接 SSL/TLS |
| SMTP 主机 | `smtp.yandex.com` |
| SMTP 端口 | `465` 直接 SSL/TLS；客户端先明文连接时可使用 `587` |
| 协议设置 | 用户需在 Yandex Mail 的“邮件客户端”设置中启用 IMAP，并允许应用密码和 OAuth token |
| 凭据 | 在 Yandex ID 中创建类型为“邮件”的应用密码；密码只显示一次 |
| 个人账号用户名 | 官方以 `username@yandex.com` 为例，使用 `@` 前的 Yandex 用户名 |
| 企业账号用户名 | Yandex 360 for Business 使用完整邮箱地址；共享邮箱还使用专门的技术用户名格式 |
| OAuth | Yandex 推荐客户端可用时采用 OAuth，但仍官方支持 Mail 应用密码 |
| POP3 | 官方不再保证 POP3 客户端的正确交互；本项目不接入 POP3 |

官方资料：

- [Yandex Mail：配置其他邮件客户端](https://yandex.com/support/yandex-360/customers/mail/en/mail-clients/others)
- [Yandex Mail：邮件客户端故障排查](https://yandex.com/support/yandex-360/customers/mail/en/mail-clients/mail-clients-troubleshooting)
- [Yandex Mail：传输加密和端口](https://yandex.com/support/yandex-360/customers/mail/en/mail-clients/ssl)
- [Yandex 360：共享邮箱客户端配置](https://yandex.com/support/yandex-360/business/mail/en/mail-clients/shared-mailboxes)
- [Yandex OAuth 实现说明](https://yandex.com/dev/id/doc/en/concepts/ya-oauth-intro)

Yandex 官方故障排查还说明，账号首次使用前可能需要在 Web 端接受用户协议；出现验证码或其他
交互式验证时必须由用户在 Yandex 完成，Worker 不得尝试绕过。

## 3. Cloudflare 可行性判断

Cloudflare Workers 的 `cloudflare:sockets` `connect()` 支持出站 TCP；默认禁止的是 SMTP 端口
`25`，本计划使用的 IMAP `993` 和后续 SMTP `465/587` 不在该禁用项内。现有 OmniMail 已通过
同一运行时连接 Gmail、QQ 和 NAVER，Yandex 可复用共享 IMAP 连接层。

- [Cloudflare Workers TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)

以上只能证明技术路径存在，不能证明 Yandex 会长期接受 Cloudflare 的动态出口。Cloudflare 说明
Worker 出站 TCP 地址并不来自其公开 IP 列表，因此必须从实际生产 Worker 完成真实登录和稳定性
验证。

当前 go/no-go 结论：

- **Go：** 可以创建隔离测试分支和临时验证端点，先做无凭据握手与真实账号低频测试。
- **Hold：** 验证通过前不创建业务迁移、不展示入口、不合并到 `main`。
- **No-go：** 若本机认证成功但 Worker 持续遭遇 IP、地区或验证码限制，则停止纯 Worker 方案。

不得加入用户自定义 IMAP 主机、任意代理、关闭证书校验或自动绕过 Yandex 风控的能力。

## 4. 首版范围与产品决策

| 决策项 | 首版选择 | 说明 |
| --- | --- | --- |
| 账号类型 | 个人 Yandex Mail | 企业自定义域名和共享邮箱后置 |
| 认证 | Mail 应用密码 | 不接受账号主密码；OAuth 单独立项 |
| 工作区 | 独立“Yandex 邮箱”入口 | 不混入 OmniMail 主收件箱 |
| 多账号 | 支持 | 容量由同步和运维上限控制 |
| 同步范围 | 仅 INBOX 有限元数据 | 不做全量历史镜像或文件夹树 |
| 远端写入 | 仅精确 `\Seen` | 不删除、移动、归档、星标或管理文件夹 |
| 发信 | 后续阶段 | IMAP 稳定后再验证 SMTP 465/587 |
| 客户端 | Web | Android 和浏览器扩展分别立项 |

首版明确不包含：

- 抓取或自动化操作 `mail.yandex.com` 网页。
- 保存 Yandex 主密码、代用户创建应用密码或处理验证码。
- Yandex Disk、联系人、日历和 CardDAV。
- Yandex 360 企业成员、共享邮箱、“Send as”或自定义域名自动识别。
- 全文件夹同步、全文索引、草稿上传和任意 IMAP 命令透传。

## 5. 阶段 0：强制协议验证

阶段 0 只使用专门测试账号和可随时撤销的独立应用密码。凭据不得进入仓库、命令历史、日志、
截图、D1 或 R2；临时验证 Worker 完成后必须删除。

### 5.1 无凭据探测

从 Cloudflare 远程预览或隔离测试 Worker 执行：

1. 分别连接 `imap.yandex.com:993` 与 `imap.ya.ru:993`，验证 TLS、greeting 和 `CAPABILITY`。
2. 记录脱敏的 Cloudflare colo、DNS/TLS/协议耗时和能力集合。
3. 根据实际稳定性选定一个首版固定 IMAP 主机，不做运行时轮询或用户自定义。
4. SMTP 只做 `smtp.yandex.com:465` TLS 和 `587` STARTTLS 的无认证探测，发信后置。

### 5.2 真实个人账号验证

1. 用户先登录 Web 端接受协议，在邮件客户端设置中启用 IMAP 与应用密码。
2. 创建名称可识别、可单独撤销的 Mail 应用密码。
3. 确认个人账号登录名到底使用 Yandex 用户名还是完整地址，锁定后不静默尝试多个值。
4. 执行 `LOGIN`、`EXAMINE INBOX`、有界 `UID SEARCH` 和少量 `UID FETCH`。
5. 验证 `UIDVALIDITY`、`UIDNEXT`、Flags、日期、大小和 `BODYSTRUCTURE`。
6. 用 `BODY.PEEK[]` 读取正文，确认读取本身不会提前标记已读。
7. 对专用样本邮件执行一次精确 `UID STORE ... +FLAGS.SILENT (\Seen)`。
8. 验证英文、中文、俄文主题，HTML、内嵌图片、普通附件和非 ASCII 文件名。
9. 撤销应用密码并确认错误被识别为凭据失效；新密码验证后可恢复。

### 5.3 稳定性验证

- 使用建议的 15 分钟账号周期连续观察至少 24 小时。
- 不进行高频真实账号压测；手动同步至少限制 60 秒一次。
- 只记录错误类别、阶段、耗时和 colo，不记录服务器原文或邮件内容。
- 验证 Queue 重试、网络中断和 Worker 终止后租约能自动过期恢复。
- 若出现验证码、账号保护或 IMAP 被关闭，立即暂停自动重试并要求人工检查。

只有生产 Worker 认证、有限同步、正文、附件、已读和 24 小时观察全部通过，才进入业务实现。

## 6. 推荐架构与最小改动

```text
Web YandexMailWorkspace
  ├─ YandexMailAccountDialog：连接、验证、重命名、更新应用密码、断开
  ├─ YandexMailScopeSwitcher：全部 Yandex / 单账号
  ├─ YandexMailSearchField：D1 元数据搜索
  ├─ 聚合列表与稳定 keyset 分页
  └─ YandexMailReader：按需正文、附件和已读反馈

Worker /api/yandex-mail
  ├─ yandex-mail-account-api.ts
  ├─ yandex-mail-message-api.ts
  ├─ yandex-mail-credentials.ts
  ├─ yandex-mail-imap.ts
  ├─ yandex-mail-store.ts
  ├─ yandex-mail-sync.ts
  └─ yandex-mail-routes.ts

Cloudflare
  ├─ D1：账号、有限元数据和验证限速
  ├─ Queue：首次、手动和定时同步
  ├─ Cron：复用现有到期账号调度
  └─ Secret：YANDEX_MAIL_CREDENTIALS_KEY
```

直接复用：

- `platform/imap/ImapConnection` 的 TLS、超时、响应上限和 IMAP 安全引用。
- NAVER 的标准 UID 同步、有限索引、过期租约恢复和可降级 Seen 模式。
- 共享 MIME 解析、安全 HTML 阅读器、附件限制、范围切换和分页模式。
- AES-GCM、用户归属校验、验证限速、Queue/Cron 和审计脱敏。

Provider 专用实现：

- 固定 Yandex 主机、用户名派生、设置检查文案和错误分类。
- 不复制 NAVER 的 `@naver.com` 校验、`ID` 假设或 UIDVALIDITY 特例。
- 不复制 Gmail 的 `X-GM-*` 扩展、标签和线程逻辑。
- MVP 不为减少文件数量而新建一套通用 Provider 框架；只提取确实重复的共享工具。

## 7. D1 与迁移计划

只有阶段 0 通过后才创建迁移。当前 `main` 最新正式迁移为
`0033_naver_mail_imap.sql`；若实施时没有其他迁移合入，使用
`0034_yandex_mail_imap.sql`。最终编号必须在开发分支创建时按最新 `main` 重新确认，计划文档本身
不预占编号。

不得复用永久保留的 `0032`，也不得改名或修改已经发布的历史迁移。

建议表：

- `yandex_mail_accounts`：用户、展示名、邮箱、登录名、应用密码密文、状态、UID 游标、同步租约。
- `yandex_mail_messages`：账号、UIDVALIDITY、UID、标准头、时间、Flags、附件标记和列表预览。
- `yandex_mail_validation_limits`：用户与 IP 哈希维度的凭据验证窗口，不保存完整 IP 或邮箱。

关键约束：

- `(user_id, email COLLATE NOCASE)` 唯一。
- `(account_id, uid_validity, imap_uid)` 唯一。
- 账号到期同步、单账号日期和跨账号日期分别建立索引。
- 增加 `schema-migration-yandex.ts` 恢复语句，运行时快速检查更新到新的完整迁移文件名。
- 迁移测试覆盖全新数据库、`0033 → 新迁移`、含测试期 `0032` 的数据库和重复部署幂等。

## 8. 凭据与协议安全

- 新增独立 `YANDEX_MAIL_CREDENTIALS_KEY` Secret，至少 32 个 UTF-8 字节。
- 使用 AES-GCM，并将 `user_id:account_id:yandex-app-password` 绑定为附加认证数据。
- 界面和 API 只接受 Mail 应用密码，明确禁止填写账号主密码。
- 不猜测应用密码固定长度；只去除首尾空白，拒绝 CR/LF、NUL、控制字符和过大输入。
- 新连接或换密码必须先通过远端验证，成功后才写入；失败不覆盖旧密文。
- API 只返回 `hasAppPassword: true`，不返回密文、掩码、长度或服务器原始响应。
- 固定主机、端口和 TLS；不允许用户提交代理、证书策略或原始 IMAP 命令。
- 日志和审计不得记录邮箱完整地址、登录名、主题、正文、附件名或应用密码。

配置建议：

- `YANDEX_MAIL_CREDENTIALS_KEY`：凭据加密 Secret。
- `YANDEX_MAIL_IMAP_ENABLED=false`：部署级紧急开关，默认关闭。
- `yandex_mail_workspace_enabled=0`：管理员入口开关，默认隐藏。

## 9. 同步、正文和附件策略

首版先沿用 NAVER 已验证的保守边界，阶段 0 后再调整：

- 首次只索引最新 100 封 INBOX 元数据。
- 后续单轮最多拉取 20 封新邮件，并刷新最近 20 封状态。
- 每账号最多保留最近 500 封 INBOX 元数据。
- 默认每账号 15 分钟同步一次；Cron 只把到期账号分批加入 Queue。
- 单次同步拥有总时间、命令、UID 范围、FETCH 批次和响应大小硬上限。
- 同一账号只允许一个带过期时间的租约；Worker 终止后能自动恢复。
- 网络错误有限退避；认证失败、风控或协议错误不高频重试。

正文使用 `BODY.PEEK[]` 按需读取，建议单封原始 MIME 上限 10 MiB；附件按需读取，建议单附件
上限 5 MiB。正文和附件不写入 D1 或 R2。邮件身份使用
`account_id + uid_validity + imap_uid`，UIDVALIDITY 变化时有限重建本地索引。

## 10. API 与 Web 计划

### 10.1 API 草案

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/yandex-mail/accounts` | 返回功能状态和当前用户账号 |
| `POST /api/yandex-mail/accounts` | 验证并加密保存账号 |
| `PATCH /api/yandex-mail/accounts/{id}` | 修改展示名称 |
| `PUT /api/yandex-mail/accounts/{id}/app-password` | 验证成功后替换应用密码 |
| `DELETE /api/yandex-mail/accounts/{id}` | 删除本地账号、密文和索引 |
| `POST /api/yandex-mail/accounts/{id}/verify` | 重新验证已保存凭据 |
| `POST /api/yandex-mail/accounts/{id}/sync` | 受限加入同步队列 |
| `GET /api/yandex-mail/messages` | 聚合列表、筛选、搜索和 cursor 分页 |
| `GET /api/yandex-mail/accounts/{accountId}/messages/{messageId}` | 按需正文和已读反馈 |
| `GET /api/yandex-mail/accounts/{accountId}/messages/{messageId}/attachments/{partId}` | 受限附件下载 |

### 10.2 Web 工作区

- 左侧增加独立“Yandex 邮箱”入口，由管理员开关控制。
- 连接页提供官方 IMAP 设置和应用密码入口，并显示用户准备步骤。
- 账号设置采用与 QQ、Gmail、NAVER 统一的二级弹窗、按钮、下拉菜单和状态样式。
- 支持全部账号、单账号、搜索、同步、验证、重命名、更新密码和断开。
- 密码只允许提交，不通过 DOM、URL、Toast、日志或 API 响应回显。
- 完成桌面、窄屏、键盘焦点、屏幕阅读器标签和中英文文案验证。

## 11. 错误分类与运维

至少区分：

- `authentication_failed`
- `imap_disabled`
- `user_action_required`
- `connection_failed`
- `timeout`
- `protocol_error`
- `response_too_large`
- `credential_key_unavailable`
- `credential_decryption_failed`
- `rate_limited`
- `account_protected`

前端展示可操作的中文提示，不透传 Yandex 原始响应。管理员日志只记录内部账号 ID、错误类别、
阶段、耗时和 colo。

回滚时先设置 `YANDEX_MAIL_IMAP_ENABLED=false` 并隐藏入口，停止新连接、读取和任务调度；保留
D1 表和密文，禁止在普通代码回滚中执行 `DROP TABLE`。用户主动断开时才级联删除其本地数据。

## 12. 测试计划

### 12.1 单元与 Worker 测试

- 应用密码加解密、错误密钥、AAD 绑定和密文不回显。
- 邮箱、登录名、名称、CRLF/NUL、控制字符和超长输入。
- 个人账号登录规则以及企业/共享邮箱明确拒绝或后置。
- IMAP greeting、CAPABILITY、EXAMINE、有限 SEARCH/FETCH、BODY.PEEK 和精确 Seen。
- UIDVALIDITY 变化、UID 缺口、Flags 刷新、索引裁剪和 MIME 边界。
- 单轮最多 20 封、总执行时间、租约竞争、租约过期、Queue 重试和手动同步限速。
- 用户 A 无法读取、验证、同步或删除用户 B 的账号与邮件。
- 新连接失败不插入账号；更新失败不覆盖旧应用密码。
- Gmail、QQ 和 NAVER 现有同步行为保持不变。

### 12.2 API、UI 与 E2E

- 功能关闭、缺少 Secret、管理员隐藏、未登录和权限隔离。
- 连接、重复账号、重命名、验证、换密码、同步和断开。
- 多账号聚合、搜索、稳定分页和部分账号故障。
- 正文、附件、已读成功及已读失败降级。
- 二级弹窗、统一下拉菜单、桌面/窄屏、键盘与敏感字段不回显。

### 12.3 验证命令

```bash
npm run docs:api
npm run check
npm test
npm run test:worker
npm run build
npm run test:e2e -- e2e/yandex-mail-workspace.e2e.ts
```

自动化测试不得连接真实 Yandex；真实账号只用于隔离环境的阶段 0 和发布验收。

## 13. 分阶段实施顺序

### 阶段 A：协议闸门

- 创建隔离分支和临时验证 Worker。
- 完成两种官方 IMAP 主机探测、真实认证和 24 小时低频观察。
- 输出不含凭据的测试记录，并作出继续或停止决定。

### 阶段 B：只读 IMAP 后端

- 从最新 `main` 分配迁移编号。
- 新增 Yandex 专用凭据、账号、消息、同步、路由和配置检查。
- 只实现有限 INBOX、按需正文/附件和可降级 Seen。

### 阶段 C：Web 与文档

- 新增独立工作区、管理员开关、统一账号弹窗和状态 UI。
- 新增 `YANDEX_MAIL_SETUP.md`、API Catalog、README 和部署检查说明。
- 完成自动化测试，不启用生产开关。

### 阶段 D：生产灰度

- 先只允许管理员测试账号，观察认证失败、账号保护、同步时长和 Queue 重试。
- 达到暂停阈值时停止问题账号，不持续重试。
- 灰度通过后再默认开放管理员入口配置。

### 阶段 E：后续能力

- 独立评估 Yandex OAuth，不与应用密码 MVP 混合实施。
- 独立验证 SMTP `465` 和 `587`、固定 From、限速和投递不确定语义。
- 企业自定义域名和共享邮箱基于真实 Yandex 360 测试账号另行立项。

## 14. 合并前检查清单

- [ ] 生产 Worker 能稳定连接选定的固定 Yandex IMAP 主机。
- [ ] 真实个人账号应用密码认证和 24 小时低频观察通过。
- [ ] 个人账号用户名格式已锁定，企业和共享邮箱没有被误接入。
- [ ] 有限同步、正文、附件、Seen、UIDVALIDITY 和俄文 MIME 通过验证。
- [ ] 凭据、服务器响应和邮件内容未出现在 API、日志、审计或 UI 中。
- [ ] 迁移编号基于最新 `main`，未复用 `0032`，升级和重复部署测试通过。
- [ ] 同步批次、执行时间、租约恢复、限速和跨用户隔离测试通过。
- [ ] 现有 Gmail、QQ、NAVER 和其他工作区回归通过。
- [ ] `npm run check`、全量测试、Worker 测试、构建和 Yandex E2E 通过。
- [ ] 功能开关默认关闭，回滚演练和部署文档完成。

## 15. 最终建议

Yandex Mail 适合加入 OmniMail。它提供标准 IMAP、直接 TLS 和独立 Mail 应用密码，所需能力与
现有 NAVER 工作区高度接近，预计不需要改动 Cloudflare 基础架构。实现上应复制已验证的安全和
同步边界，而不是重新抽象整个 Provider 系统。

当前仍不能直接进入正式开发：`imap.yandex.com` 与俄罗斯境外推荐的 `imap.ya.ru` 需要从实际
Worker 选择固定端点，真实应用密码也必须验证动态出口、用户协议和账号保护行为。阶段 A 通过后，
再按“个人账号 + 有限 INBOX + 按需正文/附件”的最小范围实施；若阶段 A 失败，则不把不稳定功能
合入 `main`。
