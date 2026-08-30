# OmniMail Float 隐私政策 / Privacy Policy

生效日期 / Effective date: 2026-08-29

OmniMail Float 是连接用户指定 OmniMail 实例的浏览器客户端。本政策说明浏览器扩展
本身如何处理数据。用户所连接实例的数据保留与管理同时受该实例运营者的政策约束。

OmniMail Float is a browser client for an OmniMail instance selected by the
user. This policy describes how the extension itself handles data. Data stored
by the selected instance is also governed by that instance operator's policy.

## 处理的数据 / Data handled

- 用户提供的 OmniMail 站点地址。
- 获得用户明确授权后，由该实例返回的账户标识、显示名称、邮箱地址、邮件摘要、用户
  主动查看的邮件正文和附件，已连接 iCloud 账号的公开名称、邮箱、状态、隐藏地址和邮件，
  以及已连接 Linux DO、Gmail、Microsoft、QQ、NAVER 与 Yandex 邮箱的账号名称、
  邮箱、状态、邮件摘要和主动查看的正文、附件。用户在 Float 中提交的 OmniMail 草稿、
  发信和回复内容会按请求传输给所选实例。
- 短期访问令牌与可撤销的刷新令牌。密码、MFA 密钥、OmniMail 网页 Cookie，以及
  iCloud Cookie、应用专用密码和 QQ 授权码不会提供给扩展。
- 本地功能设置，例如主题偏好、悬浮入口开关、通知来源、勿扰时段、面板位置、上次选择
  的邮箱和用于判断新邮件的来源游标。
- 为显示悬浮入口，内容脚本会在普通 HTTP/HTTPS 网页中运行。只有当用户主动选择
  “填入网页”时，它才会在当前页面定位邮箱输入框并写入用户选择的地址。扩展不会收集
  或上传浏览历史、当前网页网址、网页正文、页面 Cookie 或表单中原有的值。

- The OmniMail site address entered by the user.
- After explicit authorization, the account identifier, display name, mailbox
  addresses, message summaries, message bodies the user chooses to view, and
  the public names, email addresses, status, Hide My Email addresses, and mail
  of connected iCloud accounts, plus the account names, email addresses,
  status, message summaries, and user-opened message bodies of connected Gmail,
  Linux DO, Microsoft, QQ, NAVER, and Yandex Mail accounts, as returned by that instance.
- Short-lived access tokens and revocable refresh tokens. Passwords, MFA
  secrets, OmniMail website cookies, iCloud cookies, app-specific passwords,
  and QQ authorization codes are not provided to the extension.
- Local feature settings such as theme preference, floating-button state,
  panel layout, last selected mailbox, and message identifiers used to detect
  new mail.
- A content script runs on ordinary HTTP/HTTPS pages to display the floating
  entry point. Only when the user chooses to fill the page does it locate an
  email input and write the selected address. It does not collect or upload
  browsing history, the current page URL, page contents, page cookies, or
  existing form values.

## 使用目的 / How data is used

这些数据只用于连接用户选择的 OmniMail 实例、创建和填入普通或 iCloud 隐藏邮箱地址、
显示 OmniMail、iCloud、Linux DO、Gmail、Microsoft、QQ、NAVER 与 Yandex 邮箱和邮件，
以及提醒新邮件。附件、草稿和发信内容仅在用户主动操作时传输。数据不会用于广告、用户画像、信用评估或与扩展功能无关的分析。

The data is used only to connect to the user's selected OmniMail instance,
create and fill regular or iCloud Hide My Email addresses, display OmniMail,
iCloud, Linux DO, Gmail, Microsoft, QQ, NAVER, and Yandex Mail accounts and messages,
and notify the user of new mail. Attachments, drafts, and outbound messages are transferred only after the user acts. It is not used for advertising, profiling,
credit assessment, or analytics unrelated to the extension's functionality.

## 存储、传输和保留 / Storage, transmission, and retention

- 生产环境 API 通信要求 HTTPS；仅允许使用 HTTP 连接本机开发地址。
- 短期访问令牌保存在 `chrome.storage.session`；可撤销的刷新令牌与恢复登录所需的
  账户信息保存在扩展自身的 IndexedDB，普通网页中的内容脚本无法读取。刷新令牌每次
  成功使用后轮换并续期 30 天，主动退出、令牌被实例拒绝、用户清除扩展数据或卸载
  扩展时清除。非敏感设置保存在 `chrome.storage.local`。
- 邮件与账户数据在用户选择的 OmniMail 实例和扩展之间传输。发布者不会因为提供本
  扩展而自动收到这些数据；若用户选择由发布者运营的实例，则由该实例的隐私政策说明
  服务端保留方式。

- Production API traffic requires HTTPS; HTTP is permitted only for local
  development addresses.
- Short-lived access tokens are stored in `chrome.storage.session`. The
  revocable refresh token and account information needed to restore sign-in are
  stored in the extension's own IndexedDB, which content scripts on ordinary
  web pages cannot access. The refresh token is rotated and renewed for 30 days
  after each successful use, and is cleared when the user signs out, the
  instance rejects it, extension data is cleared, or the extension is
  uninstalled. Non-sensitive settings are stored in `chrome.storage.local`.
- Account and email data travels between the extension and the OmniMail
  instance selected by the user. The publisher does not automatically receive
  that data merely by distributing the extension. If the user selects an
  instance operated by the publisher, that service's policy governs server-side
  retention.

## 共享与人工访问 / Sharing and human access

OmniMail Float 不出售用户数据，不向广告平台或数据经纪商传输用户数据，也不允许人工
读取用户通信，除非用户明确请求针对特定数据的支持，或法律、安全与防滥用要求必须
处理。数据只会在提供扩展核心功能所必需时传输给用户选择的 OmniMail 实例和浏览器
提供的通知等系统服务。

OmniMail Float does not sell user data, transfer it to advertising platforms or
data brokers, or permit humans to read personal communications unless the user
explicitly requests support for specific data, or access is required by law,
security, or abuse prevention. Data is transferred only to the user's selected
OmniMail instance and browser system services when necessary for the
extension's core functionality.

## 用户控制 / User controls

用户可以退出账号以撤销设备会话、关闭悬浮入口、清除扩展存储或卸载扩展。邮箱和邮件
的访问、更正或删除应在对应 OmniMail 实例中完成。

Users can sign out to revoke the device session, disable the floating entry
point, clear extension storage, or uninstall the extension. Access, correction,
or deletion of mailbox and message data is handled by the corresponding
OmniMail instance.

## Chrome Web Store Limited Use

OmniMail Float 对从 Chrome API 和用户选择的 OmniMail 实例获得的信息的使用与传输，
遵守 Chrome Web Store 用户数据政策及其 Limited Use 要求。

OmniMail Float's use and transfer of information received from Chrome APIs and
the user's selected OmniMail instance adheres to the Chrome Web Store User Data
Policy, including the Limited Use requirements.

## 联系方式 / Contact

隐私问题请联系 / For privacy questions, contact:
[mibgb65@gmail.com](mailto:mibgb65@gmail.com)
