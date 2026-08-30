<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# OmniMail 完整 HTTP API 参考

当前 Worker 共公开 **169** 个 HTTP 端点。本文档由代码中的 API Catalog 自动生成，
与 Webmail `/settings/api` 使用同一份数据源。架构、安全模型、限速和数据生命周期说明见
[`docs/API.md`](../API.md)。

## 基础地址

```text
https://mail.example.com/api
```

将 `mail.example.com` 替换为自己的 OmniMail 域名。路径已经包含 `/api`，请勿重复拼接。

## 认证方式

| Catalog 值 | 调用方式 |
| --- | --- |
| `public` | 公开，无需登录 |
| `optional` | 可选登录；登录后可能返回更多当前用户信息 |
| `authenticated` | 登录用户；支持 Session Cookie 或 Access Token |
| `cookie` | 浏览器 Session Cookie |
| `admin` | 管理员或主管理员 |
| `superAdmin` | 仅主管理员 |
| `webhook` | Webhook 签名验证 |

Access Token 使用 `Authorization: Bearer om_at_...`。浏览器 Session 使用 `HttpOnly` Cookie；
Webhook 端点按文档示例提交 Svix 签名头。除公开端点外，服务端仍会检查角色、资源归属和功能权限。

## 方法统计

| 方法 | 数量 |
| --- | ---: |
| `GET` | 63 |
| `POST` | 53 |
| `DELETE` | 17 |
| `PATCH` | 26 |
| `PUT` | 9 |

## 分类索引

| 分类 | 端点数 | 说明 |
| --- | ---: | --- |
| [系统与公开入口](system.md) | 8 | 健康检查、初始化、注册、邀请落地、代理与 Webhook。 |
| [认证与账户](authentication.md) | 20 | 网页登录、设备令牌、MFA、扩展授权和账户生命周期。 |
| [域名与邮箱地址](mailboxes.md) | 5 | 读取域名并创建、启停、切换或删除邮箱地址。 |
| [邮件](messages.md) | 11 | 列表、详情、状态、附件、原文、发信、回复和翻译。 |
| [草稿与附件](drafts.md) | 8 | 服务端草稿的创建、保存、附件和幂等发送。 |
| [iCloud 隐藏邮箱](icloud.md) | 13 | iCloud 账号、凭据、隐藏地址和按需收件箱。 |
| [Gmail 聚合收件箱](gmail.md) | 10 | 多账号凭据、受控 IMAP 同步、聚合索引、正文与附件。 |
| [Microsoft 邮箱](microsoft.md) | 11 | OAuth2 认证、受控 IMAP 同步、正文、附件与精确已读写入。 |
| [QQ 邮箱](qq-mail.md) | 13 | 授权码认证、有限 INBOX 索引、按需正文、精确已读与受控 SMTP 发信。 |
| [NAVER 邮箱](naver-mail.md) | 10 | 应用专用密码认证、有限 INBOX 索引、按需正文、附件与精确已读。 |
| [Yandex 邮箱](yandex-mail.md) | 10 | Mail 应用密码认证、有限 INBOX 索引、按需正文、附件与精确已读。 |
| [Linux DO 邮箱](linux-do-mail.md) | 10 | 加密连接 Linux DO Mail，按需读取 INBOX 并通过官方 SMTP 发件。 |
| [管理员：运营与邮件](admin-operations.md) | 12 | 统计、审计、失败邮件、全站邮件和安全清理。 |
| [管理员：用户与访问](admin-access.md) | 11 | 邀请、用户、用户限速和收件域名管理。 |
| [管理员：设置、备份与版本](admin-settings.md) | 17 | 全局策略、存储、备份浏览和系统更新。 |

## 通用约定

- JSON 请求使用 `Content-Type: application/json`；文件上传端点使用 `multipart/form-data`。
- 认证失败通常返回 `401`，权限不足返回 `403`，资源不存在返回 `404`。
- 参数冲突或当前状态不允许操作时通常返回 `409`；限速返回 `429`，并可能包含 `Retry-After`。
- 错误响应统一使用 `{ "error": "可读错误信息" }`；不要依赖错误文案做程序分支。
- 分页端点的游标是不透明值，应原样传回，不能自行解析或拼接。
- Cookie、密码、Refresh Token、iCloud 凭据等敏感字段不会通过查询接口回传。

## 重新生成

```bash
npm run docs:api
```

提交前运行 `npm test`；API Catalog 测试会验证真实路由、应用内目录和这些分类文档完全一致。
