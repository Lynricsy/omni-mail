### 更新摘要

- 修复点击 Chrome 新邮件通知后，把扩展内部 `panel.html#inbox` 当作普通标签页打开的
  问题。
- 通知现在进入用户配置的 OmniMail Web 收件箱，并优先复用已经打开的同一收件箱标签。

### 修复

- 通知点击目标从 `chrome-extension://.../panel.html#inbox` 改为实例的
  `/mail/inbox` Web 路由。
- 如果同一实例的收件箱已经打开，扩展会激活对应标签和窗口；其他正在编辑草稿或设置的
  OmniMail 标签不会被强制改写。
- 点击后的浏览器通知会被清除；站点配置缺失或不安全时不会导航到内部扩展页。

### 安全

- 不新增 `tabs`、`windows` 或其他 Chrome 权限；复用现有精确 Host Permissions 读取
  用户配置的 OmniMail 主机标签。
- 标签查询只使用 OmniMail 主机匹配模式，不扫描无关网站；HTTPS 生产限制和本机 HTTP
  开发限制保持不变。

### 兼容性

- 需要 Chrome 120 或更高版本。
- 兼容 OmniMail Web/API `0.10.2` 或更高版本，不需要 Web/API 发版。

### 安装与升级

- 快速迭代阶段仅发布 GitHub Release ZIP，不上传 Chrome Web Store。
- `0.4.2` 用户可以直接覆盖升级，不需要重新授权或接受新 Chrome 权限。

### 测试

- 通过通知导航单元测试、TypeScript、Oxlint、扩展生产构建和真实 Chromium smoke test。
- 覆盖已有收件箱复用、其他工作区不被覆盖、不安全来源拒绝和通知清理。
