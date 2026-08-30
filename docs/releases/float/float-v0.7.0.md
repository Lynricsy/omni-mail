### 更新摘要

- Float `0.7.0` 完成八类邮箱来源的统一发现、读取和来源级错误隔离。
- 增加安全附件下载/预览、稳定分页、Microsoft 文件夹、显式同步、草稿、发信和回复。
- 新邮件通知支持本地索引来源聚合、来源开关、勿扰时段和对应 Web 深链接。

### 安全与权限

- 所有请求继续经过用户选择的 OmniMail 实例和固定白名单路径；不直连第三方 IMAP/SMTP，
  不读取第三方凭据，不提供删除、原文下载或账号管理。
- 附件下载限制为单个 5 MiB；发信附件限制为最多 5 个、合计 10 MiB；邮件 HTML 继续在
  sandbox iframe 中显示。
- 旧 Float 令牌不会静默扩大权限；升级到 `0.7.0` 需在 OmniMail 网站明确确认新增 Scope。

### 兼容性

- 需要 Chrome 120 或更高版本。
- 需要 OmniMail Web/API `0.10.3` 或更高版本；本版本使用现有固定 API 路径和新增设备
  Scope，不要求 D1 迁移。

### 发布状态

- 本版本已完成生产构建、TypeScript、Oxlint、扩展单元测试和真实 Chromium smoke test。
- 按当前发布策略，暂只准备 GitHub Release/ZIP；Chrome Web Store 上传与审核留到路线全部
  完成后的单独发布窗口，未在本版本自动提交。
