### 更新摘要

- Float `0.8.0` 将新邮件通知切换为服务端统一元数据索引。
- iCloud（应用专用密码）和 Linux DO Mail 进入后台索引；Cookie-only iCloud 仍按需读取。
- 通知轮询改为一次请求，继续支持来源开关、勿扰时段和 Web 深链接。

### 改进

- 设置页中的 iCloud 与 Linux DO Mail 通知来源不再显示“等待服务端索引”，可直接启用。
- 左侧邮箱来源保持单层展开，滚动能力保留但隐藏滚动条。

### 安全

- 服务端只保存发件人、主题、时间、UID、已读状态等列表元数据，不保存第三方邮件正文或附件。
- 邮件正文和附件仍仅在打开邮件时从原邮箱读取。
- 旧 Float 令牌不会静默扩大权限；升级需在 OmniMail 授权页明确确认通知 Scope。

### 兼容性

- 需要 OmniMail Web/API `0.10.4` 或更高版本，以及 Chrome 120 或更高版本。

### 安装与升级

- 旧 Float 令牌需要在 OmniMail 网站重新授权一次，以获得 `mail-notifications:read`。
- 当前只提供本地构建和测试包，不上传 Chrome Web Store。

### 测试

- 已通过生产构建、TypeScript、Oxlint、完整单元测试和真实 Chromium 冒烟测试。
