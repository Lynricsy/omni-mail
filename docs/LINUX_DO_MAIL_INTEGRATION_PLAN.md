# Linux DO Mail 接入计划

- 状态：只读与 SMTP 发件 Web MVP 已部署，并完成生产 Worker 真实账号链路验证
- 记录日期：2026-08-22
- 当前变更范围：阶段 2 单收件人 SMTP 发件 MVP；不包含附件、服务端 Sent 追加和多端支持

## 结论与方向

Linux DO Mail 可以通过标准 IMAP/SMTP 协议接入 OmniMail，但应被建模为用户主动连接的
外部邮箱，而不是 OmniMail 当前由 Cloudflare Email Routing 接收的自有域邮箱。
`linux.do` 的 MX 不由 OmniMail 部署者控制，因此不能复用主收件链路。

首个版本如获批准，建议只提供独立的 Linux DO Mail 工作区和按需只读收件能力；SMTP
发信作为后续独立阶段。不要在第一版同时引入完整文件夹同步、推送、统一收件箱或多端支持。

## 已确认条件

- 官方客户端页面给出的收件服务为 `mail.linux.do:993`（IMAP over TLS）。
- 官方客户端页面给出的发件服务为 `mail.linux.do:465`（SMTP over TLS）。
- 2026-08-22 的无凭据握手确认两个端口均可连接：IMAP 宣告 `IMAP4rev1` 及
  `AUTH=PLAIN` / `AUTH=LOGIN`；SMTP 宣告 `AUTH PLAIN LOGIN` 和约 10 MB 的消息大小上限。
- Linux DO Wiki 建议使用可撤销的认证令牌代替邮箱主密码；其当前公布的发信额度为
  `50/day`，但该额度可能调整，实现时必须重新确认。
- Cloudflare Workers 支持通过 `cloudflare:sockets` 建立出站 TCP 和直接 TLS 连接；平台
  禁止的 SMTP 端口是 25，Linux DO Mail 使用的 465 不在该限制内。
- 仓库现有 `email-worker/src/features/icloud/icloud-imap.ts` 已经在 Worker 中连接 IMAP 993，并具备有限的
  INBOX 搜索、邮件读取和 MIME 解析能力，可作为实现参考。
- 仓库现有 Linux DO Connect 集成只用于 OmniMail 身份认证，不提供邮箱访问授权，也不能
  替代 Linux DO Mail 地址和认证令牌。
- 2026-08-22 已从生产 Cloudflare Worker 使用真实账号完成 IMAP 登录和只读收件验证，
  用户确认连接、邮件列表及正文读取成功。

参考：

- <https://webmail.linux.do/admin/client>
- <https://wiki.linux.do/Community/LinuxDoWebMail>
- <https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/>
- [`../README.md`](../README.md)
- [`../email-worker/src/features/icloud/icloud-imap.ts`](../email-worker/src/features/icloud/icloud-imap.ts)
- [`API.md`](API.md)

## 实施前提（已满足）

恢复此计划前，需要：

1. 明确本次范围是“只读收件”还是“收件和发件”；未明确时默认只读。
2. 准备一个专门用于联调的 Linux DO Mail 账号和可撤销认证令牌，不使用主密码。
3. 获得使用该账号进行登录测试及向自身地址发送测试邮件的明确授权。
4. 从实际部署的 Cloudflare Worker 完成连通性验证。当前本地握手成功不能完全排除服务端
   对 Cloudflare 出站地址、区域或频率的限制。
5. 再次检查 Linux DO Mail 当时的使用规则、发信额度和自动化限制。

## 阶段 0：协议验证

在写业务功能前做最小、可删除的验证，且不保存凭据：

- 使用认证令牌登录 IMAP，执行 `CAPABILITY`、`EXAMINE INBOX`、`UID SEARCH` 和受限的
  `UID FETCH`。
- 确认中文或自定义文件夹名称、UID 稳定性、邮件正文大小、附件行为和超时表现。
- 验证令牌撤销后，新的 IMAP/SMTP 登录会立即失败。
- 如范围包含发信，使用 SMTP 465 登录，仅向测试账号自身发送一封纯文本邮件。
- 确认 SMTP 是否限制 `From`、真实单封大小限制、错误响应、发送频率，以及是否自动保存到
  Sent；若不自动保存，评估是否需要通过 IMAP `APPEND` 保存副本。

验收条件：实际 Worker 中 IMAP 登录和受限读取稳定成功；如需要发信，SMTP 测试成功且
行为符合服务规则。任一关键条件不成立时，停止后续实施并记录结果。

## 阶段 1：只读 MVP

建议范围：每个 OmniMail 用户首版最多连接一个 Linux DO Mail 账号，仅支持 INBOX、最近
邮件列表和单封正文，所有读取均按用户操作触发。

计划改动：

- 增加独立的 Linux DO Mail 账号表和迁移，账号记录必须按 OmniMail 用户隔离。
- 增加专用的凭据加密 Secret；认证令牌用 AES-GCM 加密，附加数据绑定用户、账号和字段。
- 固定服务器为 `mail.linux.do` 及官方端口，不允许用户填写任意主机，避免形成 TCP 代理或
  SSRF 能力。
- 从现有 iCloud IMAP 代码中只提取两个提供方确实共用的最小协议读写能力；不顺带重构
  iCloud 业务逻辑。
- 增加连接、断开、验证、最近邮件列表和正文读取 API，并补齐用户归属校验、设备令牌权限
  和审计日志。
- 支持先验证再覆盖密码或认证令牌，远程验证失败时保留原密文。
- 增加独立 Web 工作区；第一版不合并到 OmniMail 主收件箱。
- 对列表数量、正文读取字节数、命令时间和并发连接设置明确上限。
- 覆盖凭据错误、账号越权、超时、超大邮件、CRLF 注入、令牌撤销和断连清理测试。

验收条件：用户可用认证令牌连接和删除自己的账号，可读取有限数量的最近邮件及正文；
认证令牌不出现在 API 响应、日志或浏览器持久化数据中；其他用户无法访问该账号。

## 阶段 2：SMTP 发信

只在只读 MVP 稳定且确有需求后实施：

- 新增 SMTP 465 provider，使用直接 TLS 和认证令牌。
- `From` 必须固定为已验证的 Linux DO Mail 地址，禁止任意伪造发件人。
- 复用现有草稿、附件安全检查、发件队列、失败重试和审计能力；SMTP 投递结果需映射到
  现有消息状态，但不能把不确定的网络失败误判为可安全重试。
- 实现或引入最小的 RFC 5322/MIME 序列化能力，并重新核对依赖体积及 Worker 兼容性。
- OmniMail 自身的用户限速必须不高于 Linux DO Mail 当时公布的额度，并避免自动批量发信。
- 根据阶段 0 的结果决定是否将成功发送的副本追加到 Sent 文件夹。

验收条件：纯文本、HTML 和受支持附件均可发送；失败状态清晰；不会突破发信策略；不会因
超时重试造成重复邮件。

当前实现进度：

- 已增加固定 `mail.linux.do:465` 的直接 TLS SMTP provider；信封发件人和 `From` 均固定为
  当前用户已连接并验证的 Linux DO Mail 地址。
- 已复用现有 R2 正文存储、发件队列、幂等键、失败状态、审计与用户限速，并额外执行当前
  官方额度对应的 `50/day` 硬上限；全局限速关闭时该硬上限仍生效。
- 已实现 UTF-8 纯文本与 HTML alternative MIME；DATA 后连接中断会记录为投递结果不确定并
  禁止自动重试。
- Web 已提供单收件人写信入口。附件和 IMAP `APPEND` Sent 副本仍需真实 SMTP 行为验证后
  再启用。

## 暂不纳入

- 申请、恢复或管理 Linux DO Mail 账号。
- 使用 Linux DO Connect OAuth 自动获取邮箱权限或邮箱令牌。
- 后台常驻 IMAP IDLE、实时推送或全量历史同步。
- 文件夹管理、移动、删除、星标、已读状态双向同步和服务端搜索。
- 将外部邮件复制进 OmniMail 的 D1/R2 或合并进主收件箱。
- 浏览器扩展和 Android 支持；需要时分别立项，不能默认跟随 Web 首版。
- 任意 IMAP/SMTP 服务商配置；本计划只覆盖 Linux DO Mail。

## 主要风险与待确认项

- 已验证一个真实账号和当前生产 Worker；令牌撤销、更多边缘区域及超大邮件仍需后续验证。
- Linux DO Mail 可能调整端口、认证方式、配额、反滥用规则或 Mailu 配置。
- 部分地区存在连接困难；本地成功不代表所有 Cloudflare 边缘位置行为完全一致。
- SMTP 成功是否自动生成 Sent 副本尚未确认。
- 外部邮件可能超过 Worker 内存或当前解析上限，必须保持分段读取和硬性大小限制。
- 长期同步会引入 UID 去重、文件夹状态、删除语义和存储成本，不能从只读 MVP 隐式扩张。

## 后续阶段前置条件

当前已重新确认 SMTP 465、认证令牌建议及 `50/day` 公布额度，生产迁移与实际 Worker
自发自收验证也已完成。附件和向服务器 Sent 文件夹追加副本仍不在当前版本范围内。
