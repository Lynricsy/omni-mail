# OmniMail Float 长期版本计划

本计划定义 Float 与 Web 邮箱工作区的长期产品契约。版本号表示能力边界，不承诺具体
日期；每个版本只有在对应验收条件全部通过后才能发布。

Web/API 版本在当前 `0.10.x` 线上连续递增补丁号（`0.10.1`、`0.10.2`、……）。只有
出现不兼容的 Web/API 契约时才进入下一个中版本；Float 继续使用独立的 `0.4.x`、
`0.5.x` 能力版本。

## 产品契约

Float 必须接入 Web 端已经正式支持的全部邮箱来源：

- OmniMail 普通邮箱
- iCloud Hide My Email
- Linux DO Mail
- Gmail
- Microsoft Mail
- QQ 邮箱
- NAVER Mail
- Yandex Mail

外部邮箱是否出现在 Float 中，由下面的条件共同决定：

1. 实例管理员开启对应 Web 工作区，且服务端集成所需配置完整。
2. 当前用户已经在 Web 中连接至少一个该来源的账号。
3. 账号记录仍存在。`credential_error`、`permission_error` 或普通错误账号仍显示，但
   标记为“需要在 Web 修复”，不能因为出错而从 Float 消失。
4. 当前扩展设备令牌拥有该来源所需的最小 Scope；缺少时显示重新授权入口。

OmniMail 普通邮箱是基础来源：登录后始终可用；创建按钮仍受用户邮箱额度和创建权限
约束。外部邮箱的连接、断开、凭据录入、OAuth、应用密码更新和身份管理继续只在 Web
完成，Float 不接收这些高敏感凭据。

## 当前能力基线

| 来源 | Web 当前能力 | Float 0.3.2 | 长期目标 |
| --- | --- | --- | --- |
| OmniMail | 地址创建、收件、附件、草稿、发信、回复、邮件状态 | 创建、收件、正文、已读 | Web 用户权限允许的完整日常邮件能力 |
| iCloud | 账号、隐藏地址、创建地址、收件 | 隐藏地址、创建地址、收件 | 保持现有能力并进入统一来源框架 |
| Linux DO | 单账号、收件、已发送、搜索、发信 | 未接入 | 收件、已发送、搜索及无附件发信 |
| Gmail | 多账号、INBOX 索引、搜索、正文、附件、已读 | 未接入 | 完整只读能力与同步状态 |
| Microsoft | 多账号、文件夹、索引、搜索、正文、附件、已读 | 未接入 | 完整只读能力与文件夹筛选 |
| QQ | 多账号、多发件身份、INBOX、搜索、正文、附件、发信和回复 | 未接入 | 完整读取，以及按 Web 权限发信和回复 |
| NAVER | 多账号、INBOX 索引、搜索、正文、附件、已读 | 未接入 | 完整只读能力与同步状态 |
| Yandex | 多账号、INBOX 索引、搜索、正文、附件、已读 | 未接入 | 完整只读能力与同步状态 |

“长期目标”只复用 Web 已经存在的服务端能力。Gmail、Microsoft、NAVER、Yandex 当前
没有发信 API，Float 不自行绕过 Web 边界直连 SMTP，也不提前申请写权限。

## 技术方向

### 固定来源适配器

在扩展内建立固定白名单的 `MailSourceAdapter` 注册表，而不是继续在 `PanelApp` 和
Service Worker 中为每个来源增加大型 `switch`：

```ts
type MailSourceId =
  | 'omnimail'
  | 'icloud'
  | 'linuxdo'
  | 'gmail'
  | 'microsoft'
  | 'qq'
  | 'naver'
  | 'yandex'

interface MailSourceAdapter {
  id: MailSourceId
  capabilities: MailSourceCapabilities
  discover(): Promise<MailSourceAccount[]>
  list(input: MailSourceListInput): Promise<MailSourcePage>
  detail(input: MailSourceMessageInput): Promise<FloatMessageDetail>
}
```

适配器只调用仓库中已有、写死路径的 OmniMail API，并把不同响应转换成统一的账号、
摘要、正文、附件和分页类型。不得把来源 ID、账号 ID 或用户输入拼成任意远程 URL，
Service Worker 也不得退化成通用请求代理。

Gmail、QQ、NAVER、Yandex 与 Microsoft 已经共享相近的索引邮件结构，应共用一个
`IndexedImapAdapter`，仅配置固定路径和少量字段差异。iCloud、Linux DO 与 OmniMail
保留各自的小型适配器，不强迫不同语义进入错误抽象。

### 来源发现

`api:mail-sources` 在 Service Worker 中执行以下流程：

1. 读取 `/api/config` 中的工作区和集成开关。
2. 仅对已经开启的来源并行调用其账号列表接口。
3. 使用 `Promise.allSettled` 隔离故障；一个来源失败不能阻断其他来源。
4. 只把拥有账号记录的外部来源返回给面板，同时保留错误账号及安全化状态。
5. 记住生成页和收件页各自最后使用的来源；来源断开后回退到 OmniMail。

### 面板结构

现有双来源横向 Tab 不扩展到 8 项。生成页和收件页改用语义化来源选择器：

- 生成页只列出具备 `canGenerateAddress` 的 OmniMail 与可用 iCloud 账号。
- 收件页列出全部已连接来源，并在第二级选择“全部账号”或单账号。
- 来源选择器使用 button/listbox 或 combobox 语义，支持方向键、Enter、Escape、可见
  焦点和完整名称；不使用只能点击的 `div`。
- 错误来源保留在列表中并显示文本状态，不能只靠颜色区分。
- 账号和凭据管理按钮统一跳转 Web，不在窄面板复制管理表单。
- `0.4.x` 不提供跨来源“全部收件”；在服务端具备稳定聚合游标前，不并行拼接 8 组
  不同分页结果冒充统一时间线。

UI/UX 检索没有找到专门针对“多邮箱来源选择器”的 React 规则，因此以上选择结合了
仓库现有 `PanelSelect`、键盘导航、语义化控件和窄面板不横向溢出的通用约束。

### 设备令牌 Scope

Scope 按能力和来源最小化，不能一次性为未来功能申请权限：

- `0.4.x` 只增加各来源的账号读取、邮件列表和正文读取 Scope。
- 附件、主动同步、发信和回复分别在实际功能上线的版本增加独立 Scope。
- `0.3.x` 令牌刷新时继续保留原 Scope，不静默扩大。升级到 `0.4.0` 后检测缺失 Scope，
  明确说明新增来源并要求用户重新授权一次。
- 后续新增新来源或写能力时再次明确授权；不能用通配 Scope 自动继承未来数据访问。
- 服务端继续执行用户归属、工作区开关、发送权限、限速、幂等和固定远端端点检查。

授权页和 Chrome Web Store 披露必须与每个版本的实际 Scope 同步更新。

## 版本路线

### 0.3.2：可靠性与商店合规

范围已经在当前分支完成：

- 修复邮件列表、正文请求竞态和失效登录状态残留。
- 增加授权前数据用途说明。
- 更新商店填写稿和 OmniMail/iCloud 截图。
- 不新增来源和设备 Scope，保证补丁升级不要求重新授权。

发布门槛：扩展类型检查、生产构建、Chromium smoke、商店素材和隐私披露全部通过。

### 0.4.0：统一来源核心、Gmail 与 QQ 读取

状态：已在 `feature/float-mail-source-core` 实现，等待完整发布验证。

- 新增统一账号、消息摘要、正文、分页和能力类型。
- 新增来源适配器注册表与 `api:mail-sources` 发现流程。
- 把现有 OmniMail/iCloud 迁移到来源注册表，保持功能不回退。
- 接入 Gmail 和 QQ 的账号范围、最近 INBOX、搜索、正文与已读反馈。
- 横向来源 Tab 改为键盘可操作的来源选择器。
- 增加 Gmail/QQ 最小读取 Scope，并提供升级重新授权流程。

发布门槛：四个来源可独立失败和恢复；切换来源时旧请求不能覆盖新来源；QQ 发信入口
在此版本仍不可见。

### 0.4.1：Microsoft、NAVER 与 Yandex 读取

状态：已在 `feature/float-more-sources` 实现，等待完整发布验证。

- 三个来源进入同一个 `IndexedImapAdapter`，复用列表、搜索、正文和账号状态 UI。
- Microsoft 初版只读取 INBOX；文件夹切换留到 `0.5.0`，避免阻塞全部来源接入。
- 增加对应最小读取 Scope、授权说明、商店披露和自动化测试。

发布门槛：多账号、同步中、凭据失效、分页和打开即尝试已读的差异都有独立覆盖。

### 0.4.2：Linux DO 与全来源基线完成

状态：已在 `feature/float-linuxdo-source` 实现，等待完整发布验证。

- 接入 Linux DO 收件箱和已发送列表，映射其单账号、实时 IMAP 与发送状态差异。
- 完成 8 类来源的自动发现、隐藏、错误保留和 Web 修复入口。
- 增加契约测试：Web 正式来源清单与 Float 适配器清单必须一致；以后 Web 新增正式邮箱
  来源但没有 Float 计划时，CI 直接失败并要求显式处理。

发布门槛：所有已启用且当前用户已连接的来源都能在 Float 中打开最近邮件和正文；
未连接来源不出现，错误账号不消失。

### 0.5.0：阅读能力补齐

- 为 Gmail、Microsoft、QQ、NAVER、Yandex 和 OmniMail 增加安全附件下载/预览。
- 补齐稳定分页、“加载更多”、来源内搜索和按账号筛选。
- 支持 Microsoft 文件夹与 Linux DO 已发送视图。
- 只有 Web 已提供安全同步队列的来源才显示“同步”；按钮复用服务端租约和限速。
- 邮件 HTML 继续使用 sandbox，远程图片继续遵守实例设置，不允许内容脚本读取正文。

该版本增加附件和主动同步 Scope，需要再次明确授权；不包含发信权限。

### 0.6.0：按能力开放发信与回复

- OmniMail：新建、回复、草稿和附件，严格复用用户 `canReply`、域名发信配置和配额。
- QQ：账号与已验证发件身份选择、新建和回复，保持单收件人及投递不确定保护。
- Linux DO：无附件新建邮件，From 固定为已验证账号，保持每日上限和幂等。
- iCloud、Gmail、Microsoft、NAVER、Yandex 不显示发信入口，除非 Web 先提供相同能力。
- 写能力按来源单独请求 Scope；用户拒绝写 Scope 后仍能继续只读。

发布门槛：任何发送都必须由用户明确提交；不能后台代发，不能由页面 Content Script
提供收件人或正文，不能绕过服务端幂等、限速和审计。

### 0.7.0：统一新邮件提醒

- 通知从只轮询 OmniMail 扩展为全部已连接来源。
- 只轮询服务端已有索引和轻量版本游标，不允许浏览器每分钟触发 6 组远端 IMAP 同步。
- 按 `sourceId + accountId + messageId` 保存通知游标，避免跨来源 ID 冲突和重复提醒。
- 徽标聚合未读数；点击通知直接打开对应来源与邮件。
- 设置中支持全部通知、按来源关闭和勿扰时段。

发布门槛：浏览器重启、令牌轮换、账号断开、同步延迟和重复消息均不会产生通知风暴。

### 1.0.0：稳定契约

- 正式承诺“Web 正式邮箱来源必须有 Float 处理结论”：支持、明确排期或因平台限制记录
  阻塞原因，不能静默遗漏。
- 冻结来源适配器、能力枚举、错误状态和深链接协议的兼容规则。
- 完成中英文 UI、键盘与读屏、亮暗主题、375px 窄宽、减少动态效果和商店升级测试。
- 建立来源级兼容矩阵和回归夹具，后续新增来源优先增加适配器与契约测试，不复制整个
  收件面板。

## 测试与发布规则

每个来源至少覆盖：

- 工作区关闭、集成未配置、未连接、正常、同步中、凭据错误和普通错误状态。
- 单账号、多账号、账号切换、来源切换、搜索、分页、正文竞态和令牌失效。
- 服务端归属拒绝、缺少 Scope、写能力拒绝、限速和网络超时。
- 邮件 HTML 清理、附件文件名与类型、远程图片策略和超大响应限制。

每个 Float 版本发布前必须通过：

1. `npm run check`
2. 相关 Worker Scope 与路由测试
3. 扩展单元测试和 `npm run test:extension`
4. 真实 Chromium 的全部来源 smoke fixture
5. 从上一商店版升级的重新授权与权限提示测试
6. Chrome Web Store 介绍、截图、权限理由、数据类型和隐私政策一致性检查

## 明确不做

- 不在 Float 中录入或更新第三方邮箱密码、应用密码、Cookie、OAuth Refresh Token。
- 不从 Content Script 读取网页正文、浏览历史、Cookie 或表单原有内容。
- 不为尚未上线的附件、发信或未来来源提前申请 Scope。
- 不直连 Gmail、Microsoft、QQ、NAVER、Yandex、Linux DO 或 Apple 的 IMAP/SMTP/Web
  接口；所有操作继续经过用户选择的 OmniMail 实例。
- 不用客户端并行拼接不同来源分页结果冒充稳定的“全部收件”。
