<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# Gmail 聚合收件箱

**Gmail unified inbox**

多账号凭据、受控 IMAP 同步、聚合索引、正文与附件。

> Multi-account credentials, controlled IMAP synchronization, unified indexing, message bodies, and attachments.

本分类共 **10** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。

<!-- endpoint:GET /api/gmail/accounts catalog:8c806c7ce678 -->
## `GET /api/gmail/accounts`

**列出 Gmail 账号 / List Gmail accounts**

返回当前用户的脱敏 Gmail 账号和同步状态，不返回凭据或密文。

> Return the current user’s sanitized Gmail accounts and sync state without credentials or ciphertext.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | No parameters |
| 成功响应 | 200 · { enabled, accounts } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/gmail/accounts" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/gmail/accounts catalog:3168ab06daf1 -->
## `POST /api/gmail/accounts`

**连接 Gmail 账号 / Connect a Gmail account**

验证固定 Gmail IMAP 端点后，用独立密钥加密保存应用专用密码。

> Validate the fixed Gmail IMAP endpoint, then encrypt the app password with a dedicated key.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · name, email, appPassword |
| 成功响应 | 201 · { account } |

> 注意：只接受 Google 生成的 16 位应用专用密码；不要提交 Google 账号主密码。
>
> Note: Only a Google-generated 16-character app password is accepted; never submit the Google Account password.

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/gmail/accounts" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "name": "Personal Gmail",
  "email": "owner@gmail.com",
  "appPassword": "xxxx xxxx xxxx xxxx"
}'
```

<!-- endpoint:PATCH /api/gmail/accounts/:id catalog:fcdc835f1957 -->
## `PATCH /api/gmail/accounts/{id}`

**重命名 Gmail 账号 / Rename a Gmail account**

修改当前用户 Gmail 账号的显示名称。

> Change the display name of a Gmail account owned by the current user.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · name |
| 成功响应 | 200 · { account } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/gmail/accounts/resource_id" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "name": "Work Gmail"
}'
```

<!-- endpoint:PUT /api/gmail/accounts/:id/app-password catalog:75078e4f9f8e -->
## `PUT /api/gmail/accounts/{id}/app-password`

**更新 Gmail 应用密码 / Update a Gmail app password**

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
  --url "https://mail.example.com/api/gmail/accounts/resource_id/app-password" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "appPassword": "xxxx xxxx xxxx xxxx"
}'
```

<!-- endpoint:DELETE /api/gmail/accounts/:id catalog:6c4ac65f7f7b -->
## `DELETE /api/gmail/accounts/{id}`

**断开 Gmail 账号 / Disconnect a Gmail account**

级联删除本地凭据和元数据索引，不会撤销 Google 端应用密码。

> Cascade-delete local credentials and metadata without revoking the Google-side app password.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { ok, remoteRevocationRequired=true } |

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/gmail/accounts/resource_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/gmail/accounts/:id/verify catalog:0a78911d7610 -->
## `POST /api/gmail/accounts/{id}/verify`

**验证 Gmail 连接 / Verify a Gmail connection**

使用已保存凭据重新执行只读 Gmail IMAP 登录与 EXAMINE。

> Use the saved credential to run read-only Gmail IMAP login and EXAMINE again.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { ok, validatedAt } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/gmail/accounts/resource_id/verify" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/gmail/accounts/:id/sync catalog:cf8cb9117ecb -->
## `POST /api/gmail/accounts/{id}/sync`

**请求 Gmail 同步 / Request Gmail synchronization**

在频率限制和账号租约保护下，把只读同步任务加入 Queue。

> Queue a read-only sync under rate limiting and an account lease.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · limit=10\|20\|50? |
| 成功响应 | 202 · { queued: true, limit } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/gmail/accounts/resource_id/sync" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "limit": 20
}'
```

<!-- endpoint:GET /api/gmail/messages catalog:5d0abc8719b4 -->
## `GET /api/gmail/messages`

**列出 Gmail 聚合邮件 / List unified Gmail messages**

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
  --url "https://mail.example.com/api/gmail/messages?limit=30" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/gmail/accounts/:accountId/messages/:messageId catalog:2c57f22dafd7 -->
## `GET /api/gmail/accounts/{accountId}/messages/{messageId}`

**读取 Gmail 正文 / Read a Gmail message**

验证账号归属后，通过 BODY.PEEK[] 读取正文，并以受控 STORE 命令同步标记已读。

> Verify account ownership, fetch the body with BODY.PEEK[], and synchronize Seen with a controlled STORE command.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · accountId, messageId |
| 成功响应 | 200 · { message } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/gmail/accounts/gmail_account_id/messages/message_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/gmail/accounts/:accountId/messages/:messageId/attachments/:partId catalog:b84d9f53f460 -->
## `GET /api/gmail/accounts/{accountId}/messages/{messageId}/attachments/{partId}`

**下载 Gmail 附件 / Download a Gmail attachment**

验证账号与邮件归属后，按需读取并转发不超过 5 MiB 的附件。

> Verify account and message ownership, then fetch and proxy an attachment up to 5 MiB.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · accountId, messageId, partId |
| 成功响应 | 200 · attachment bytes |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/gmail/accounts/gmail_account_id/messages/message_id/attachments/0" \
  --header "Authorization: Bearer om_at_..." \
  --output "gmail-attachment.bin"
```
