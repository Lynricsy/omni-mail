# OmniMail Float 浏览器扩展

OmniMail Float 是与本仓库一起构建的 Chrome Manifest V3 扩展。它在普通网页中
注入一个隔离的悬浮入口，通过 OmniMail 网站授权获得可撤销的设备令牌，用于生成
普通邮箱和 iCloud 隐藏地址，查看 OmniMail、iCloud、Linux DO、Gmail、Microsoft、QQ、
NAVER 与 Yandex 邮箱的来信，并接收 OmniMail 新邮件通知。扩展不会收集或处理用户
密码、iCloud 凭据或第三方邮箱凭据。

隐私政策见 [`docs/EXTENSION_PRIVACY.md`](../docs/EXTENSION_PRIVACY.md)，商店介绍、权限
理由和隐私披露填写稿见 [`STORE_LISTING.md`](./STORE_LISTING.md)，多邮箱来源的长期
版本计划见 [`ROADMAP.md`](./ROADMAP.md)。

## 构建与安装

```powershell
npm install
npm run build:extension
```

然后打开 `chrome://extensions/`，启用开发者模式，选择“加载已解压的扩展程序”，
加载仓库根目录下的 `dist-extension/`。

扩展只会注入普通 HTTP/HTTPS 页面，无法注入 `chrome://`、Chrome 扩展商店等浏览器
内部页面。

## 配置 API 来源

Chrome Web Store 正式版本的扩展 ID 是 `fpeecjailboemocpmpcbjaghpkpcaihf`。

Chrome Web Store 正式版本无需配置 `APP_ORIGINS`。主管理员登录 OmniMail 后，在
**系统设置 → 官方浏览器扩展** 中开启固定商店版本即可。

使用开发者模式加载 `dist-extension/` 时：

1. 在 `chrome://extensions/` 复制 OmniMail Float 的 32 位扩展 ID。
2. 在 Worker 的 `APP_ORIGINS` 中加入对应来源：

   ```text
   chrome-extension://你的扩展ID
   ```

3. 如果 `APP_ORIGINS` 已包含其他来源，使用英文逗号分隔。
4. 重新部署 Worker 后，在扩展中填写 OmniMail 站点根地址并点击“前往 OmniMail
   授权”。

通过 Chrome Web Store 安装时扩展 ID 固定，并由全局开关控制；开发者模式下只要
保持扩展目录和清单不变，ID 通常也会保持不变。

## Chrome Web Store 发布会话

在 Windows 上从仓库根目录运行：

```powershell
.\scripts\open-extension-store.ps1
```

脚本会打开独立的 Chrome 发布窗口。登录状态保存在本机
`%LOCALAPPDATA%\OmniMail\ChromeWebStoreProfile`，不会写入 Git 仓库；关闭窗口后再次
运行同一脚本即可复用登录。

发布新版本前运行 `npm run update:extension-store-assets` 更新截图，并按
[`STORE_LISTING.md`](./STORE_LISTING.md) 核对商店介绍、单一用途、权限理由、远程代码
声明和数据处理类型。上传 ZIP 后再提交审核，不要把 GitHub Release ZIP 误当成已经完成
商店发布。

## 安全边界

- 登录使用 Chrome Identity、一次性授权码和 PKCE S256；密码与 MFA 只在 OmniMail
  网站中处理。
- 授权码两分钟内有效、只能兑换一次，并且在 D1 中只保存哈希。
- 短期 Access Token 存放在 `chrome.storage.session`；可撤销的 Refresh Token 存放在
  扩展自身的 IndexedDB，普通网页中的 Content Script 无法读取。浏览器重启后会自动
  恢复登录；Refresh Token 每次成功使用后轮换并续期 30 天。
- 扩展令牌使用最小权限 Scope：除普通邮箱的读取、创建、收件与标记已读外，只能读取
  已连接 iCloud 账号的公开元数据、已有别名和最近来信并创建隐藏地址，以及读取已连接
  Linux DO、Gmail、Microsoft、QQ、NAVER 与 Yandex 账号的公开元数据、邮件列表和用户
  主动打开的正文。不能读取或修改第三方凭据、管理账号、同步远端邮箱、下载附件、发信、
  删除邮件、下载原文或修改账户设置。
- Content Script 只负责悬浮窗口和当前页面邮箱输入框填充，不能读取令牌。
- Service Worker 只接受预定义的 OmniMail API 操作，不提供任意 URL 请求代理。
- 邮件 HTML 在 sandbox iframe 中显示，脚本、表单、远程图片和危险属性会被移除。
- 为了自动显示悬浮入口，扩展需要访问普通 HTTP/HTTPS 网页；可以在扩展设置里关闭
  悬浮按钮。
- 扩展设置提供跟随系统、亮色和暗色三档主题；选择保存在本机并同步应用到面板与悬浮
  窗外壳。

开发者模式扩展和 Chrome Web Store 扩展通常具有不同 ID。如果两者都需要访问同一
个 OmniMail 实例，应开启官方扩展开关，并把开发版的
`chrome-extension://扩展ID` 加入 `APP_ORIGINS`。
