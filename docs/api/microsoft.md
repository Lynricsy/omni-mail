<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# Microsoft 邮箱

**Microsoft Mail**

OAuth2 认证、受控 IMAP 同步、正文、附件与精确已读写入。

> OAuth2 authentication, controlled IMAP synchronization, bodies, attachments, and exact Seen writes.

本分类共 **11** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。

<!-- endpoint:GET /api/microsoft/accounts catalog:72ad0c21cd5c -->
## `GET /api/microsoft/accounts`

**列出 Microsoft 账号 / List Microsoft accounts**

返回当前用户的脱敏账号与同步状态，不返回令牌、密码或密文。

> Return sanitized account and synchronization state without tokens, passwords, or ciphertext.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | No parameters |
| 成功响应 | 200 · { enabled, accounts } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/microsoft/accounts" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/microsoft/accounts/import catalog:87ad664da722 -->
## `POST /api/microsoft/accounts/import`

**导入 Microsoft 账号 / Import Microsoft accounts**

逐项验证 1–25 个结构化 OAuth2 账号；可确认加密保存四字段组合密码，但不用于认证。

> Validate 1–25 structured OAuth2 accounts; confirmed four-field combination passwords may be stored encrypted but are never used for authentication.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · accounts[1..25] · { name?, email, authMode=oauth2, refreshToken, clientId, authority?, password?, persistPasswordConfirmed? } |
| 成功响应 | 201/207 · { results: [{ index, status=accepted\|duplicate\|error, code?, error?, account? }] } |

> 注意：服务端只接受结构化字段；不要把整段逐行文本直接提交到该端点。
>
> Note: The server accepts structured fields only; do not submit the raw multiline import text.

> 注意：password 仅作为可选组合密码留存；提交时 persistPasswordConfirmed 必须为 true，且该密码永不参与认证。
>
> Note: password is optional retained combination data only; persistPasswordConfirmed must be true when it is sent, and the password is never used for authentication.

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/microsoft/accounts/import" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "accounts": [
    {
      "name": "Outlook",
      "email": "owner@outlook.com",
      "authMode": "oauth2",
      "refreshToken": "refresh-token",
      "clientId": "00000000-0000-4000-8000-000000000000",
      "authority": "common"
    }
  ]
}'
```

<!-- endpoint:PATCH /api/microsoft/accounts/:id catalog:848de51105b0 -->
## `PATCH /api/microsoft/accounts/{id}`

**重命名 Microsoft 账号 / Rename a Microsoft account**

修改当前用户账号的本地显示名称。

> Change the local display name of an account owned by the current user.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · name |
| 成功响应 | 200 · { account } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/microsoft/accounts/resource_id" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "name": "Work Outlook"
}'
```

<!-- endpoint:PUT /api/microsoft/accounts/:id/credential catalog:7d512e5f2694 -->
## `PUT /api/microsoft/accounts/{id}/credential`

**替换 Microsoft 凭据 / Replace a Microsoft credential**

验证成功后才替换 OAuth2 凭据；不允许切换为密码认证。

> Replace OAuth2 credentials only after validation; password authentication cannot be enabled.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · authMode=oauth2, refreshToken, clientId, authority? |
| 成功响应 | 200 · { ok: true } |

### cURL 示例

```bash
curl --request PUT \
  --url "https://mail.example.com/api/microsoft/accounts/resource_id/credential" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "authMode": "oauth2",
  "refreshToken": "replacement-refresh-token",
  "clientId": "00000000-0000-4000-8000-000000000000",
  "authority": "common"
}'
```

<!-- endpoint:DELETE /api/microsoft/accounts/:id catalog:9a407ac3f364 -->
## `DELETE /api/microsoft/accounts/{id}`

**断开 Microsoft 账号 / Disconnect a Microsoft account**

级联删除本地密文、文件夹和元数据索引，不删除远端邮件。

> Cascade-delete local ciphertext, folders, and metadata without deleting remote mail.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { ok, remoteRevocationRequired } |

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/microsoft/accounts/resource_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/microsoft/accounts/:id/verify catalog:f46d9a7007b3 -->
## `POST /api/microsoft/accounts/{id}/verify`

**验证 Microsoft 连接 / Verify a Microsoft connection**

用已保存凭据验证固定 Microsoft IMAP 端点并刷新文件夹缓存。

> Validate the fixed Microsoft IMAP endpoint with saved credentials and refresh the folder cache.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { ok, validatedAt } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/microsoft/accounts/resource_id/verify" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/microsoft/accounts/:id/sync catalog:9a17df7dc67f -->
## `POST /api/microsoft/accounts/{id}/sync`

**请求 Microsoft 同步 / Request Microsoft synchronization**

在冷却和账号租约保护下，将 INBOX 只读同步加入 Queue。

> Queue read-only INBOX synchronization under cooldown and account lease protection.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 202 · { queued: true } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/microsoft/accounts/resource_id/sync" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/microsoft/accounts/:id/folders catalog:47e3ffad1333 -->
## `GET /api/microsoft/accounts/{id}/folders`

**列出 Microsoft 文件夹 / List Microsoft folders**

读取缓存文件夹；refresh=1 时先从 IMAP LIST 安全刷新。

> Read cached folders, optionally refreshing safely with IMAP LIST when refresh=1.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; Query · refresh=0\|1? |
| 成功响应 | 200 · { folders } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/microsoft/accounts/resource_id/folders?refresh=1" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/microsoft/messages catalog:ddd0359935f2 -->
## `GET /api/microsoft/messages`

**列出 Microsoft 邮件 / List Microsoft messages**

按账号与服务器返回的文件夹读取本地元数据，支持搜索、1–200 条和游标分页。

> Read local metadata by account and server-returned folder with search, 1–200 item limits, and cursor pagination.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Query · accountId?, folder?, q?, limit=1..200?, cursor?, refresh=0\|1? |
| 成功响应 | 200 · { messages, page, folderPath } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/microsoft/messages?accountId=microsoft_account_id&folder=INBOX&limit=50" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/microsoft/accounts/:accountId/messages/:messageId catalog:4dc4956d492e -->
## `GET /api/microsoft/accounts/{accountId}/messages/{messageId}`

**读取 Microsoft 正文 / Read a Microsoft message**

再次校验用户、账号、文件夹与 UIDVALIDITY 后，通过 BODY.PEEK[] 按需读取 MIME 正文，并对未读邮件精确写入 \Seen。

> Revalidate user, account, folder, and UIDVALIDITY, fetch MIME content on demand with BODY.PEEK[], and write Seen for unread messages only.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · accountId, messageId |
| 成功响应 | 200 · { message } |

> 注意：已读写入失败不会阻断正文响应；移动、删除、归档、星标和其他 flags 写入均未开放。
>
> Note: A Seen write failure does not block the body response; move, delete, archive, star, and other flag writes are not available.

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/microsoft/accounts/microsoft_account_id/messages/message_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/microsoft/accounts/:accountId/messages/:messageId/attachments/:partId catalog:179628f0435d -->
## `GET /api/microsoft/accounts/{accountId}/messages/{messageId}/attachments/{partId}`

**下载 Microsoft 附件 / Download a Microsoft attachment**

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
  --url "https://mail.example.com/api/microsoft/accounts/microsoft_account_id/messages/message_id/attachments/0" \
  --header "Authorization: Bearer om_at_..." \
  --output "microsoft-attachment.bin"
```
