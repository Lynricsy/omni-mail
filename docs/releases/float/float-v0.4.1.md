### 更新摘要

- Float 新增 Microsoft、NAVER 与 Yandex 已连接邮箱的账号筛选、搜索、最近邮件和安全
  正文阅读。
- 用户从 `0.4.0` 升级时，Gmail/QQ 会继续可用；确认新增只读授权后才显示三个新来源。
- 七类来源统一使用同一套键盘可操作选择器和固定白名单适配器。

### 新增

- Microsoft 初版读取 INBOX 索引，不开放文件夹或文件夹刷新。
- NAVER 与 Yandex 支持全部账号/单账号、300ms 防抖搜索、正文和本地已读反馈。
- 三个来源的错误账号继续显示，并提供 Web 修复入口；已索引邮件仍可阅读。

### 改进

- 来源授权由全有或全无改为逐来源判断，旧 Scope 不会导致已经授权的 Gmail/QQ 消失。
- Web 跳转从来源白名单适配器读取固定路径，避免在 Hook 中重复分支。
- 来源选择器补充 End、方向键与 Enter 的真实 Chromium 回归。

### 安全

- 新 Scope 只允许 Microsoft、NAVER、Yandex 的账号列表、邮件列表和单封正文 GET。
- Microsoft 文件夹、账号管理、同步、附件和全部写操作不开放。
- 第三方凭据仍只在用户选择的 OmniMail 实例中处理，不会提供给 Float。

### 兼容性

- 需要 Chrome 120 或更高版本。
- 需要 OmniMail Web/API `0.10.1` 或更高版本。

### 安装与升级

- 快速迭代阶段仅发布 GitHub Release ZIP，不上传 Chrome Web Store。
- `0.4.0` 用户会看到“解锁更多已连接邮箱”，确认后才读取三个新来源。
- 开发者模式可下载本版本 ZIP，解压后覆盖加载。

### 测试

- 通过 TypeScript、Oxlint、设备 Scope 与适配器单元测试、Web 授权 Playwright E2E、
  扩展生产构建和真实 Chromium smoke test。
- Chromium 覆盖 `0.4.0` 部分 Scope 启动、Gmail/QQ 保留、升级授权，以及 Microsoft、
  NAVER、Yandex 的账号、列表、搜索、正文和来源键盘导航。
