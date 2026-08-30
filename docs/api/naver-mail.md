<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# NAVER 邮箱

**NAVER Mail**

应用专用密码认证、有限 INBOX 索引、按需正文、附件与精确已读。

> App-specific-password authentication, bounded INBOX indexing, on-demand bodies, attachments, and exact Seen writes.

本分类共 **10** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。

<!-- endpoint:GET /api/naver-mail/accounts catalog:0297416153ae -->
## `GET /api/naver-mail/accounts`

**列出 NAVER 邮箱账号 / List NAVER Mail accounts**

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
  --url "https://mail.example.com/api/naver-mail/accounts" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/naver-mail/accounts catalog:08f234be8311 -->
## `POST /api/naver-mail/accounts`

**连接 NAVER 邮箱账号 / Connect a NAVER Mail account**

验证个人 @naver.com 邮箱的应用专用密码后，加密保存并请求首次同步。

> Validate an app-specific password for a personal @naver.com mailbox, encrypt it, and request the initial sync.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · name, email, appPassword |
| 成功响应 | 201 · { account } |

> 注意：appPassword 必须由 NAVER 两步验证生成，不能提交 NAVER 登录密码。
>
> Note: appPassword must be generated through NAVER two-step verification; never submit the NAVER sign-in password.

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/naver-mail/accounts" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "name": "Personal NAVER Mail",
  "email": "owner@naver.com",
  "appPassword": "naver-app-password"
}'
```

<!-- endpoint:PATCH /api/naver-mail/accounts/:id catalog:8ebe59662333 -->
## `PATCH /api/naver-mail/accounts/{id}`

**重命名 NAVER 邮箱账号 / Rename a NAVER Mail account**

修改当前用户 NAVER 邮箱账号的本地显示名称。

> Change the local display name of a NAVER Mail account owned by the current user.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · name |
| 成功响应 | 200 · { account } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/naver-mail/accounts/resource_id" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "name": "Personal NAVER"
}'
```

<!-- endpoint:PUT /api/naver-mail/accounts/:id/app-password catalog:ed71bdf009c7 -->
## `PUT /api/naver-mail/accounts/{id}/app-password`

**更新 NAVER 应用专用密码 / Update a NAVER app-specific password**

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
  --url "https://mail.example.com/api/naver-mail/accounts/resource_id/app-password" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "appPassword": "replacement-app-password"
}'
```

<!-- endpoint:DELETE /api/naver-mail/accounts/:id catalog:9967a7d013a4 -->
## `DELETE /api/naver-mail/accounts/{id}`

**断开 NAVER 邮箱账号 / Disconnect a NAVER Mail account**

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
  --url "https://mail.example.com/api/naver-mail/accounts/resource_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/naver-mail/accounts/:id/verify catalog:fd67157f8bfd -->
## `POST /api/naver-mail/accounts/{id}/verify`

**验证 NAVER 邮箱连接 / Verify a NAVER Mail connection**

使用已保存凭据重新执行只读 NAVER IMAP 登录与 EXAMINE。

> Use the saved credential to run read-only NAVER IMAP login and EXAMINE again.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { ok, validatedAt } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/naver-mail/accounts/resource_id/verify" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/naver-mail/accounts/:id/sync catalog:92def2e59819 -->
## `POST /api/naver-mail/accounts/{id}/sync`

**请求 NAVER 邮箱同步 / Request NAVER Mail synchronization**

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
  --url "https://mail.example.com/api/naver-mail/accounts/resource_id/sync" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/naver-mail/messages catalog:1176ca300d82 -->
## `GET /api/naver-mail/messages`

**列出 NAVER 聚合邮件 / List unified NAVER Mail messages**

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
  --url "https://mail.example.com/api/naver-mail/messages?limit=30" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/naver-mail/accounts/:accountId/messages/:messageId catalog:8fd4f7ff6d21 -->
## `GET /api/naver-mail/accounts/{accountId}/messages/{messageId}`

**读取 NAVER 邮箱正文 / Read a NAVER Mail message**

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
  --url "https://mail.example.com/api/naver-mail/accounts/naver_mail_account_id/messages/message_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/naver-mail/accounts/:accountId/messages/:messageId/attachments/:partId catalog:81b33281a399 -->
## `GET /api/naver-mail/accounts/{accountId}/messages/{messageId}/attachments/{partId}`

**下载 NAVER 邮箱附件 / Download a NAVER Mail attachment**

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
  --url "https://mail.example.com/api/naver-mail/accounts/naver_mail_account_id/messages/message_id/attachments/0" \
  --header "Authorization: Bearer om_at_..." \
  --output "naver-mail-attachment.bin"
```
