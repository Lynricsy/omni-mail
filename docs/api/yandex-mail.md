<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# Yandex 邮箱

**Yandex Mail**

Mail 应用密码认证、有限 INBOX 索引、按需正文、附件与精确已读。

> Mail app-password authentication, bounded INBOX indexing, on-demand bodies, attachments, and exact Seen writes.

本分类共 **10** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。

<!-- endpoint:GET /api/yandex-mail/accounts catalog:6ad8eb95382b -->
## `GET /api/yandex-mail/accounts`

**列出 Yandex 邮箱账号 / List Yandex Mail accounts**

返回当前用户的脱敏账号与同步状态，不返回应用专用密码或密文。

> Return sanitized accounts and synchronization state without app-specific passwords or ciphertext.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | No parameters |
| 成功响应 | 200 · { enabled, accounts } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/yandex-mail/accounts" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/yandex-mail/accounts catalog:0691d62fcc01 -->
## `POST /api/yandex-mail/accounts`

**连接 Yandex 邮箱账号 / Connect a Yandex Mail account**

验证个人 @yandex.com 邮箱的应用专用密码后，加密保存并请求首次同步。

> Validate an app-specific password for a personal @yandex.com mailbox, encrypt it, and request the initial sync.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · name, email, appPassword |
| 成功响应 | 201 · { account } |

> 注意：appPassword 必须是 Yandex ID 中为“邮件”创建的应用密码，不能提交 Yandex 登录密码。
>
> Note: appPassword must be a Mail app password created in Yandex ID; never submit the Yandex sign-in password.

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/yandex-mail/accounts" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "name": "Personal Yandex Mail",
  "email": "owner@yandex.com",
  "appPassword": "yandex-app-password"
}'
```

<!-- endpoint:PATCH /api/yandex-mail/accounts/:id catalog:5e9c6ed9c1fc -->
## `PATCH /api/yandex-mail/accounts/{id}`

**重命名 Yandex 邮箱账号 / Rename a Yandex Mail account**

修改当前用户 Yandex 邮箱账号的本地显示名称。

> Change the local display name of a Yandex Mail account owned by the current user.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · name |
| 成功响应 | 200 · { account } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/yandex-mail/accounts/resource_id" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "name": "Personal Yandex"
}'
```

<!-- endpoint:PUT /api/yandex-mail/accounts/:id/app-password catalog:263ad58811e8 -->
## `PUT /api/yandex-mail/accounts/{id}/app-password`

**更新 Yandex 应用专用密码 / Update a Yandex app-specific password**

先验证新密码，再替换密文；验证失败时保留原凭据。

> Validate the new password before replacing ciphertext; preserve the existing credential if validation fails.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · appPassword |
| 成功响应 | 200 · { account } |

### cURL 示例

```bash
curl --request PUT \
  --url "https://mail.example.com/api/yandex-mail/accounts/resource_id/app-password" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "appPassword": "replacement-app-password"
}'
```

<!-- endpoint:DELETE /api/yandex-mail/accounts/:id catalog:fc7e8f3bdac7 -->
## `DELETE /api/yandex-mail/accounts/{id}`

**断开 Yandex 邮箱账号 / Disconnect a Yandex Mail account**

级联删除本地密文和元数据索引，不删除远端邮件或代为撤销应用密码。

> Cascade-delete local ciphertext and metadata without deleting remote mail or revoking the app password.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { ok, remoteRevocationRequired=true } |

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/yandex-mail/accounts/resource_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/yandex-mail/accounts/:id/verify catalog:c7b9491556d1 -->
## `POST /api/yandex-mail/accounts/{id}/verify`

**验证 Yandex 邮箱连接 / Verify a Yandex Mail connection**

使用已保存凭据重新执行只读 Yandex IMAP 登录与 EXAMINE。

> Use the saved credential to run read-only Yandex IMAP login and EXAMINE again.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { ok, validatedAt } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/yandex-mail/accounts/resource_id/verify" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/yandex-mail/accounts/:id/sync catalog:fc3bc8c9e29a -->
## `POST /api/yandex-mail/accounts/{id}/sync`

**请求 Yandex 邮箱同步 / Request Yandex Mail synchronization**

在频率限制和账号租约保护下，把有限 INBOX 同步任务加入 Queue。

> Queue a bounded INBOX synchronization under rate limiting and an account lease.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 202 · { queued: true } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/yandex-mail/accounts/resource_id/sync" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/yandex-mail/messages catalog:f0d458cc2f28 -->
## `GET /api/yandex-mail/messages`

**列出 Yandex 聚合邮件 / List unified Yandex Mail messages**

按账号或全部账号搜索 D1 元数据索引，并使用稳定游标分页。

> Search the D1 metadata index for one or all accounts with stable cursor pagination.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Query · accountId?, q?, limit=1..50?, cursor? |
| 成功响应 | 200 · { messages, page } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/yandex-mail/messages?limit=30" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/yandex-mail/accounts/:accountId/messages/:messageId catalog:4deb645da80a -->
## `GET /api/yandex-mail/accounts/{accountId}/messages/{messageId}`

**读取 Yandex 邮箱正文 / Read a Yandex Mail message**

校验归属与 UIDVALIDITY，通过 BODY.PEEK[] 按需读取正文，并独立尝试写入 Seen。

> Validate ownership and UIDVALIDITY, fetch the body on demand with BODY.PEEK[], and independently attempt a Seen write.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · accountId, messageId |
| 成功响应 | 200 · { message } |

> 注意：已读写入失败不会阻断正文；不开放移动、删除、归档、星标或发信。
>
> Note: A Seen write failure does not block the body; move, delete, archive, star, and send operations are unavailable.

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/yandex-mail/accounts/yandex_mail_account_id/messages/message_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/yandex-mail/accounts/:accountId/messages/:messageId/attachments/:partId catalog:8604abb9192a -->
## `GET /api/yandex-mail/accounts/{accountId}/messages/{messageId}/attachments/{partId}`

**下载 Yandex 邮箱附件 / Download a Yandex Mail attachment**

校验归属后按需读取并返回不超过 5 MiB 的附件。

> Verify ownership, then fetch and return an attachment up to 5 MiB on demand.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · accountId, messageId, partId |
| 成功响应 | 200 · attachment bytes |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/yandex-mail/accounts/yandex_mail_account_id/messages/message_id/attachments/0" \
  --header "Authorization: Bearer om_at_..." \
  --output "yandex-mail-attachment.bin"
```
