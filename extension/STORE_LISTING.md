# OmniMail Float Chrome Web Store 填写稿

本文件是 Chrome Web Store 条目 `fpeecjailboemocpmpcbjaghpkpcaihf` 的发布源稿。
每次上传新版本时，以实际扩展行为为准核对本页与
[`docs/EXTENSION_PRIVACY.md`](../docs/EXTENSION_PRIVACY.md)，并同步更新商店后台。

## 简短说明

在任意网页生成和填入邮箱地址，读写已授权邮件并接收多来源通知。

## 详细说明

OmniMail Float 将用户指定的自托管 OmniMail 收件箱放进当前网页的隔离悬浮面板，
无需反复切换标签页即可生成、复制和填入邮箱地址，并查看最近来信。

主要功能：

- 连接用户自己选择并由管理员允许访问的 OmniMail 实例。
- 在普通 HTTP/HTTPS 网页侧边显示可关闭、可停靠的悬浮邮箱面板。
- 创建普通 OmniMail 邮箱，或使用和创建 iCloud Hide My Email 隐藏地址。
- 复制地址，或在用户点击“填入网页”后写入当前页面的邮箱输入框。
- 自动显示用户已在 Web 连接的 Linux DO、Gmail、Microsoft、QQ、NAVER 与 Yandex 邮箱，不在
  扩展中收集第三方凭据。
- 在全部已连接来源之间切换，筛选账号、搜索邮件，并查看经过安全处理的正文。
- 下载或安全预览已授权来源的附件；支持稳定分页和 Microsoft 文件夹。
- OmniMail 支持草稿、发信和回复；QQ 与 Linux DO 支持服务端开放的发信/回复能力。
- 在后台检查服务端轻量索引的新邮件，并显示聚合徽标和浏览器通知。
- 点击通知时打开或激活用户配置的对应 Web 工作区，不打开扩展内部页面。
- 可按来源关闭通知并设置本机勿扰时段；iCloud（应用专用密码）和 Linux DO Mail 已接入，
  Cookie-only iCloud 仍保持手动读取。
- 支持跟随系统、亮色和暗色主题。

隐私与安全：

- 密码、MFA 和网页登录 Cookie 只由用户选择的 OmniMail 网站处理，不会提供给扩展。
- 扩展通过 Chrome Identity、PKCE 和一次性授权码获得可随时撤销的设备令牌。
- 扩展处理用户选择的 OmniMail 站点地址、账户名称和邮箱、邮箱地址、邮件摘要与用户
  主动查看的正文、已连接邮箱的公开账号信息与来信、认证令牌及本地功能设置。
- 这些数据只用于连接实例、生成和填入地址、显示邮件及通知新邮件，不用于广告、用户
  画像、信用评估或与核心功能无关的分析。
- 内容脚本不会收集或上传浏览历史、当前网页网址、网页正文、Cookie 或表单原有值；
  只有用户主动选择“填入网页”时才定位邮箱输入框并写入所选地址。
- 邮件 HTML 在沙箱中显示，脚本、表单、远程图片和危险属性会被移除。

使用前提：需要一个可用的 OmniMail 实例，并由该实例的主管理员开启官方浏览器扩展。

## 单一用途

让用户在正在浏览的网页中连接自己选择的 OmniMail 实例，生成、填入普通或 iCloud
隐藏邮箱地址，并查看 OmniMail 及已连接第三方邮箱的来信。

## 权限理由

- `alarms`：每分钟检查服务端已有索引，以更新聚合未读徽标并发现新邮件；不会触发远端
  IMAP 同步。
- `identity`：使用 Chrome Identity 回调、PKCE 和一次性授权码完成用户明确确认的登录。
- `notifications`：在检测到已启用来源的新邮件时显示浏览器通知。
- `storage`：在本机保存用户选择的站点地址、主题、悬浮窗口设置、通知来源/勿扰时段、
  新邮件判断标识和受保护的扩展登录状态。
- `https://*/*`：连接用户在运行时自行指定的 HTTPS OmniMail 实例。
- `http://localhost/*`、`http://127.0.0.1/*`：只支持本机开发和测试实例；其他非加密
  HTTP 地址会被扩展拒绝。
- `content_scripts.matches` 的普通 HTTP/HTTPS 网页访问：显示 Float 悬浮入口，并在
  用户点击“填入网页”后定位当前页面的邮箱输入框。扩展不读取或上传浏览历史、网页
  URL、网页正文、Cookie 或表单原有值。
- `web_accessible_resources`：只向普通网页提供扩展自身打包的 `panel.html` 和
  `content.css`，用于显示隔离面板；资源使用动态 URL。

## 隐私后台

数据处理类型：

- Personally identifiable information
- Authentication information
- Personal communications
- Website content

远程代码：选择 **No, I am not using remote code**。扩展包不执行远程托管的 JavaScript、
Wasm、`eval` 字符串或远端下发的业务逻辑；与用户指定 OmniMail 实例的通信仅用于同步
账户和邮件数据并执行用户请求的服务端操作。

隐私政策 URL：
`https://github.com/mibgb65-cloud/OmniMail/blob/main/docs/EXTENSION_PRIVACY.md`

Limited Use 各项声明应全部按实际行为确认。不得在行为改变后沿用本页而不更新披露。

## 素材

- `01-floating-generate.jpg`：普通邮箱生成和填入。
- `02-floating-inbox.jpg`：普通邮箱收件箱。
- `03-floating-message.jpg`：安全化邮件正文。
- `04-floating-icloud-generate.jpg`：iCloud 隐藏邮箱使用与创建。
- `05-floating-icloud-inbox.jpg`：iCloud 来信正文。
- `promo-small-440x280.jpg`：小型宣传图。
