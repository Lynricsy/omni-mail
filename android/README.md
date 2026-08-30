# OmniMail Android

OmniMail 的原生 Android 客户端，面向手机和平板。客户端直接连接用户自托管的
OmniMail Worker API，不保存 Cloudflare、Resend 或 SendFlare 密钥。

## 当前阶段

当前版本已覆盖日常邮件与 iCloud 工作流：

- 配置并校验 HTTPS OmniMail 实例地址；
- 使用设备 Access / Refresh Token 登录，兼容 TOTP 与恢复码；
- 手机单栏、平板双栏/三栏自适应邮箱界面；
- 收件箱、星标、已发送和垃圾箱；
- 邮件详情、已读和星标操作；
- 服务端草稿自动保存、附件上传、带附件发送与系统文件保存器下载；
- iCloud 账号、隐藏地址、最近来信和完整正文管理，支持最多 5 个地址顺序创建；
- Room 最近邮件缓存、离线只读、WorkManager 后台同步、新邮件通知与邮件深链；
- 设置页显示当前版本，并检查包含 Android APK 的 GitHub Release。

完整范围与分期见 [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)。

## 构建

要求 JDK 17、Android SDK 36。首次克隆后执行：

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug
```

有可用模拟器或设备时，运行 Compose 手机/平板测试：

```powershell
.\gradlew.bat connectedDebugAndroidTest
```

Debug APK 输出到 `app/build/outputs/apk/debug/app-debug.apk`。

## 安全边界

- 生产实例只允许 HTTPS；Android 清文流量被禁用。
- Access Token 只保存在进程内存中。
- Refresh Token 由 Android Keystore 的 AES-GCM 密钥加密后保存。
- Android 主动申请仅覆盖邮件、草稿、附件和 iCloud 的最小权限设备令牌。
- HTML 邮件在禁用 JavaScript、表单、文件和内容访问的隔离 WebView 中显示。
- 最近邮件与正文只保存在应用私有 Room 数据库，退出登录时清除且不参与系统备份。
- 锁屏通知默认只显示发件人，不显示主题或正文。
