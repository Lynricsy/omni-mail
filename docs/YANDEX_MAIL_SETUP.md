# Yandex Mail 设置指南

OmniMail 的 Yandex Mail 首版仅支持个人 `@yandex.com` 邮箱。它是独立的只读 IMAP 工作区：
同步有限 INBOX 元数据，正文与附件按需读取，打开正文后仅尝试同步远端已读状态；不支持发信、
删除、移动、归档、星标或文件夹管理。

## 1. 准备 Yandex 账号

1. 先登录一次 Yandex Mail Web 页面并接受尚未完成的用户协议或安全确认。
2. 在 Yandex Mail 的 **邮件客户端** 设置中启用 IMAP，并允许应用密码与 OAuth token。
3. 在 Yandex ID 的 **应用密码** 页面创建类型为“邮件”的独立密码，名称建议使用 `OmniMail`。
4. 当场安全保存密码；Yandex 只显示一次。不要填写 Yandex 登录主密码。
5. 确认地址是个人 `@yandex.com` 邮箱；Yandex 360 企业域名和共享邮箱暂不支持。

官方说明：

- [配置其他邮件客户端](https://yandex.com/support/yandex-360/customers/mail/en/mail-clients/others)
- [邮件客户端故障排查](https://yandex.com/support/yandex-360/customers/mail/en/mail-clients/mail-clients-troubleshooting)
- [SSL/TLS 与端口](https://yandex.com/support/yandex-360/customers/mail/en/mail-clients/ssl)

## 2. 配置 Worker

创建至少 32 个随机 UTF-8 字节的 Secret：

```text
YANDEX_MAIL_CREDENTIALS_KEY=<至少 32 字节的随机 Secret>
```

首次部署和灰度期间保持：

```text
YANDEX_MAIL_IMAP_ENABLED=false
```

部署会应用 `0034_yandex_mail_imap.sql`。该密钥只用于 AES-GCM 加密 Yandex Mail 应用密码；
更换或丢失密钥会导致已有凭据无法解密。

## 3. 灰度启用

1. 从实际 Cloudflare Worker 验证专用测试账号可以完成登录、`EXAMINE INBOX`、有限同步、正文、
   附件和已读写入。
2. 使用 15 分钟同步周期观察至少 24 小时，确认没有持续验证码、账号保护或协议停用。
3. 设置 `YANDEX_MAIL_IMAP_ENABLED=true` 并重新部署。
4. 由管理员在 **系统设置 → 邮箱功能入口** 显式开启 Yandex 邮箱入口。
5. 用户从左侧 **Yandex 邮箱** 填写显示名称、完整地址和 Mail 应用密码。

功能默认关闭。隐藏入口或把部署开关设为 `false` 不会删除已有账号、密文或索引；部署开关关闭
时会停止新连接、验证、手动同步、正文读取和后台调度。

## 4. 已验证连接参数

- 固定主机：`imap.yandex.com`
- 端口：`993`
- 传输：直接 TLS，严格证书校验
- 个人账号登录名：邮箱 `@` 前的 Yandex 用户名
- 密码：Yandex ID 中为“邮件”创建的应用密码

2026-08-28 已从隔离的 Cloudflare Worker 使用个人测试账号完成 TLS、应用密码认证和只读
`EXAMINE INBOX`，并取得有效 `UIDVALIDITY` 与 `UIDNEXT`。探测 Worker、Secrets 和本地临时
文件已在验证后删除。该结果证明真实认证链路可用，但不能替代上线前的 24 小时稳定性观察。

## 5. 数据与限制

- 首次索引最近 100 封；后续单轮最多拉取 20 封新增邮件并刷新最近 20 封状态。
- 每账号最多保留最近 500 封 INBOX 元数据，默认每 15 分钟调度一次。
- 同步租约带过期时间，Worker 中断后可恢复，不会永久停留在 `syncing`。
- 单封正文读取上限 10 MiB，单附件下载上限 5 MiB；正文与附件不持久化到 D1 或 R2。
- API 不返回应用密码、密文、长度或掩码片段；日志不记录邮件内容或服务器原始响应。
- 删除本地连接后，还需在 Yandex ID 中手动撤销对应应用密码。

完整协议边界、企业账号后置策略、测试矩阵和回滚说明见
[`YANDEX_MAIL_INTEGRATION_PLAN.md`](YANDEX_MAIL_INTEGRATION_PLAN.md)。
