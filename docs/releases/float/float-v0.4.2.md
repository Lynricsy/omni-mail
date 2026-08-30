### 更新摘要

- Float 新增 Linux DO Mail 已连接账号的收件箱、已发送列表和安全正文阅读。
- OmniMail、iCloud、Linux DO、Gmail、Microsoft、QQ、NAVER、Yandex 八类 Web 邮箱
  来源现在都有明确的 Float 读取路径。
- 从 `0.4.1` 升级时只新增 Linux DO 只读授权，既有来源继续可用。

### 新增

- Linux DO 支持单账号收件箱、已发送视图和搜索；连接、凭据与发信仍留在 Web 端。
- Linux DO 使用独立适配器，不强行套用多账号索引邮箱的分页语义。
- 八来源契约测试覆盖来源发现、错误保留、固定 API 路径和正文沙箱。

### 改进

- 来源选择器继续使用语义化 combobox/listbox，Linux DO 文件夹切换支持键盘操作。
- Linux DO 账号断开或暂时不可用时只影响自身来源，其他邮箱不会消失。

### 安全

- 新 Scope 只允许 Linux DO 脱敏账号、INBOX/已发送列表和单封正文 GET。
- Linux DO 连接、凭据更新、验证、发信和其他写操作继续拒绝。
- Float 不读取 Linux DO 密码或认证令牌，不直连远端 IMAP/SMTP。

### 兼容性

- 需要 Chrome 120 或更高版本。
- 需要 OmniMail Web/API `0.10.2` 或更高版本。

### 安装与升级

- 快速迭代阶段仅发布 GitHub Release ZIP，不上传 Chrome Web Store。
- `0.4.1` 用户会看到“解锁更多已连接邮箱”，确认后才读取 Linux DO。
- 开发者模式可下载本版本 ZIP，解压后覆盖加载。

### 测试

- 通过 TypeScript、Oxlint、设备 Scope 与适配器单元测试、Web 授权 Playwright E2E、
  扩展生产构建和真实 Chromium smoke test。
- Chromium 覆盖 Linux DO 收件箱、已发送、搜索、正文和八来源升级授权。
