### 更新摘要

- 修复来源、域名、邮箱账号等自定义选择器在快速键盘操作时可能仍提交旧选项的问题。
- 包含 `0.4.3` 的通知跳转修复：点击新邮件通知进入 OmniMail Web 收件箱，不再打开
  `chrome-extension://.../panel.html#inbox`。

### 修复

- 选择器使用同步活动项引用处理方向键、Home、End、Enter 和空格；即使 React 尚未完成
  下一次渲染，确认操作也会提交用户最后移动到的选项。
- Linux CI 中连续 `ArrowDown → Enter` 不再偶发停留在原邮箱域名。
- 通知点击会打开或激活用户配置的 `/mail/inbox`，不会覆盖草稿或设置标签。

### 安全

- 不新增 Chrome 权限；通知标签查询只限定用户配置的 OmniMail 主机。
- Web/API、设备 Scope、第三方凭据边界和远程代码声明均没有变化。

### 兼容性

- 需要 Chrome 120 或更高版本。
- 兼容 OmniMail Web/API `0.10.2` 或更高版本，不需要 Web/API 发版。

### 安装与升级

- 快速迭代阶段仅发布 GitHub Release ZIP，不上传 Chrome Web Store。
- `0.4.2` 或 `0.4.3` 可以直接覆盖升级，不需要重新授权或接受新权限。

### 测试

- 通过 604 项单元测试、TypeScript、Oxlint、扩展生产构建和真实 Chromium smoke test。
- Release CI 覆盖连续键盘选择、通知导航、八来源收件和会话恢复。
