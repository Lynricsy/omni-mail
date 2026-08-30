# NAVER Mail 设置指南

OmniMail 的 NAVER Mail 接入仅支持个人 `@naver.com` 邮箱。首版是只读 IMAP 工作区：
同步有限 INBOX 元数据，正文与附件按需读取，打开正文后仅尝试同步远端已读状态；不支持
发信、删除、移动、归档、星标或文件夹管理。

## 上线前闸门

NAVER 可能针对 Cloudflare Worker 的动态 TCP 出口触发异常登录或自动停用 IMAP。生产开放前
必须使用可随时撤销应用密码的专用测试账号，从实际部署的 Worker 完成登录、正文、附件、已读、
凭据撤销/恢复，并以 15 分钟周期观察至少 24 小时。未完成这项验证时，应保持
`NAVER_MAIL_IMAP_ENABLED=false` 和 NAVER 工作区入口关闭。

## 1. 准备 NAVER 账号

1. 在 NAVER 账号中开启两步验证。
2. 在 NAVER Mail 设置中开启 IMAP/SMTP。
3. 为 OmniMail 单独生成应用专用密码并安全保存；不要使用 NAVER 登录密码。
4. 确认账号是个人 `@naver.com` 邮箱；NAVER Works 和自定义企业域名不在支持范围。

官方说明：

- [IMAP/SMTP 设置](https://help.naver.com/service/30029/contents/21344?osType=COMMONOS)
- [服务器参数与故障检查](https://help.naver.com/service/30029/contents/21351?osType=COMMONOS)
- [应用专用密码](https://help.naver.com/service/5640/contents/8584)

## 2. 配置 Worker

创建至少 32 个随机 UTF-8 字节的 Secret：

```text
NAVER_MAIL_CREDENTIALS_KEY=<至少 32 字节的随机 Secret>
```

测试阶段显式保持：

```text
NAVER_MAIL_IMAP_ENABLED=false
```

部署时会应用 `0033_naver_mail_imap.sql`。密钥只用于 AES-GCM 加密应用专用密码；更换或丢失
密钥会导致已有凭据无法解密。

## 3. 灰度启用

完成真实账号闸门后：

1. 设置 `NAVER_MAIL_IMAP_ENABLED=true` 并重新部署。
2. 由管理员在 **系统设置 → 邮箱功能入口** 显式开启 NAVER 邮箱入口。
3. 用户从左侧 **NAVER 邮箱** 连接账号，填写显示名称、完整邮箱和应用专用密码。
4. 观察认证失败、同步耗时、Queue 重试和 NAVER 账号中的外部应用状态。

功能默认关闭，只有显式设置环境开关为 `true` 才会启用。隐藏入口或把环境开关设为 `false`
不会删除 D1 中已有账号、密文或索引；环境
开关关闭时会停止新连接、验证、手动同步、正文读取和后台调度。

## 4. 数据与限制

- 固定连接 `imap.naver.com:993`，直接 TLS，登录用户名从邮箱本地部分派生为 NAVER ID。
- 首次索引最近 100 封，后续单轮最多拉取 20 封新增邮件并刷新最近 20 封状态；最多保留最近
  500 封 INBOX 元数据，每 15 分钟调度一次，过期同步租约会自动恢复。
- 单封正文读取上限 10 MiB，单附件下载上限 5 MiB；正文与附件不持久化到 D1 或 R2。
- API 不返回应用专用密码、密文、长度或掩码片段；日志不记录主题、正文、附件名或服务端原文。
- 删除本地连接后，还需在 NAVER 设置中手动撤销对应应用专用密码。

完整协议边界、真实验证矩阵和回滚策略见
[`NAVER_MAIL_INTEGRATION_PLAN.md`](NAVER_MAIL_INTEGRATION_PLAN.md)。
