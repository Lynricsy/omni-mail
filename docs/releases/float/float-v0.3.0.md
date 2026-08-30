### 更新摘要

- OmniMail Float 现可在悬浮面板中统一使用普通邮箱与 iCloud 隐藏邮箱，并直接查看两类邮箱的来信。
- 扩展面板完成收件箱、生成邮箱和 iCloud 工作流整合，支持批量创建隐藏地址与主题设置。

### 新增

- 新增普通邮箱收件箱、生成邮箱、邮件来源切换和 iCloud 收件箱面板。
- 新增 iCloud 隐藏邮箱候选预览、批量创建、用途标签和创建进度反馈。
- 新增跟随系统、亮色和暗色三档主题设置，并同步应用到面板与悬浮窗外壳。

### 改进

- 重构扩展面板布局，优化侧栏、邮件列表、滚动条、移动端布局和加载状态。
- 扩展摘要更新为同时说明 OmniMail 与 iCloud 隐藏邮箱能力。
- 补充 iCloud 邮件来源、地址生成和设置入口的无障碍标签与交互反馈。

### 安全

- iCloud 功能继续使用受限设备令牌 Scope；扩展不读取或上传 iCloud Cookie、应用专用密码或其他凭据。
- 扩展权限仍限制为 `alarms`、`identity`、`notifications`、`storage` 及必要的网页访问权限。

### 兼容性

- 需要 Chrome 120 或更高版本。
- 需要 OmniMail Web/API 支持 iCloud 工作流和扩展授权接口。

### 安装与升级

- Chrome Web Store 条目 `fpeecjailboemocpmpcbjaghpkpcaihf` 已提交 `0.3.0` 审核，并设置审核通过后自动发布。
- 开发者模式安装可使用仓库生成的 `dist-extension/`，或下载本版本 ZIP 后解压加载。

### 测试

- 通过 TypeScript 类型检查。
- 通过 80 个测试文件、364 项单元测试。
- 通过 Chrome 扩展生产构建和真实 Chromium smoke test。
