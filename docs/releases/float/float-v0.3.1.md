### 更新摘要

- 修复 iCloud 上游凭据或权限失败被误判为 OmniMail 登录过期的问题。
- 无 iCloud+、仅网页访问或没有 Hide My Email 权限的账号会显示明确失败提示，不影响当前用户登录。

### 改进

- 配合 OmniMail Web/API `0.3.4`，Apple `401` / `403` 和无 Hide My Email 权限响应会作为独立业务错误处理。

### 修复

- iCloud 同步失败不再触发扩展或网页的全局退出登录流程。
- 失败的新账号不会写入 OmniMail，也不会触发后续自动同步。

### 安全

- OmniMail 会话认证与 Apple 凭据状态保持隔离；扩展权限、设备令牌 Scope 和凭据边界没有扩大。

### 兼容性

- 需要 Chrome 120 或更高版本。
- 建议配合 OmniMail Web/API `0.3.4` 或更高版本使用。

### 安装与升级

- Chrome Web Store 条目 `fpeecjailboemocpmpcbjaghpkpcaihf` 使用 `0.3.1` 修复包更新。
- 开发者模式可下载本版本 ZIP 解压后覆盖加载。

### 测试

- 通过 TypeScript 类型检查、365 项单元测试和 6 项 iCloud 工作区 Playwright E2E。
- 通过扩展生产构建和真实 Chromium smoke test。
