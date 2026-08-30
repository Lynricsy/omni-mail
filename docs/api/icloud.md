<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# iCloud 隐藏邮箱

**iCloud Hide My Email**

iCloud 账号、凭据、隐藏地址和按需收件箱。

> iCloud accounts, credentials, aliases, and on-demand inbox access.

本分类共 **13** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。

<!-- endpoint:GET /api/icloud/accounts catalog:82cd25d54b99 -->
## `GET /api/icloud/accounts`

**列出 iCloud 账户 / List iCloud accounts**

返回当前用户连接的 iCloud 账户，不解密或返回凭据。

> Return the current user’s connected iCloud accounts without decrypting or returning credentials.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | No parameters |
| 成功响应 | 200 · { accounts } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/icloud/accounts" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/icloud/accounts catalog:a09af8fb6337 -->
## `POST /api/icloud/accounts`

**连接 iCloud 账户 / Connect an iCloud account**

通过应用专用密码连接主邮箱，或通过 Cookie 管理隐藏邮箱；两种方式可单独或同时配置。

> Connect primary mail with an app-specific password, manage aliases with cookies, or configure both.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · name, cookies?, host=icloud.com\|icloud.com.cn, icloudEmail?, appPassword? |
| 成功响应 | 201 · { account } |

> 注意：Cookie 属于高敏感凭据，只应提交给自己的 OmniMail 实例。
>
> Note: Cookies are highly sensitive credentials and should only be sent to your own OmniMail instance.

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/icloud/accounts" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "name": "My iCloud",
  "cookies": {
    "X_APPLE_WEB_KB": "cookie-value"
  },
  "host": "icloud.com"
}'
```

<!-- endpoint:PATCH /api/icloud/accounts/:id catalog:a5d669daf183 -->
## `PATCH /api/icloud/accounts/{id}`

**修改 iCloud 账户备注 / Rename an iCloud account**

修改当前用户连接的 iCloud 账户备注名称。

> Change the display name of an iCloud account connected by the current user.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · name |
| 成功响应 | 200 · { ok: true, name } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/icloud/accounts/resource_id" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "name": "Personal iCloud"
}'
```

<!-- endpoint:DELETE /api/icloud/accounts/:id catalog:2fa96f6258b9 -->
## `DELETE /api/icloud/accounts/{id}`

**删除 iCloud 账户 / Delete an iCloud account**

删除当前用户的加密 Cookie、应用专用密码和账户记录。

> Delete the current user’s encrypted cookies, app password, and account record.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { ok: true } |

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/icloud/accounts/resource_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:PUT /api/icloud/accounts/:id/cookies catalog:35bfd25e2478 -->
## `PUT /api/icloud/accounts/{id}/cookies`

**更新 iCloud Cookie / Update iCloud cookies**

覆盖并重新验证账户 Cookie，同时刷新别名统计。

> Replace and revalidate account cookies, then refresh alias statistics.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · cookies |
| 成功响应 | 200 · { account } |

### cURL 示例

```bash
curl --request PUT \
  --url "https://mail.example.com/api/icloud/accounts/resource_id/cookies" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "cookies": {
    "X_APPLE_WEB_KB": "new-cookie-value"
  }
}'
```

<!-- endpoint:PUT /api/icloud/accounts/:id/app-password catalog:298fc5074c13 -->
## `PUT /api/icloud/accounts/{id}/app-password`

**设置 iCloud 应用专用密码 / Set an iCloud app-specific password**

验证 IMAP 登录后加密保存 iCloud 邮箱和应用专用密码。

> Validate IMAP login, then encrypt the iCloud email and app-specific password.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · icloudEmail, appPassword |
| 成功响应 | 200 · { ok: true, icloudEmail } |

### cURL 示例

```bash
curl --request PUT \
  --url "https://mail.example.com/api/icloud/accounts/resource_id/app-password" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "icloudEmail": "owner@icloud.com",
  "appPassword": "xxxx-xxxx-xxxx-xxxx"
}'
```

<!-- endpoint:GET /api/icloud/aliases catalog:19a0d38bd83e -->
## `GET /api/icloud/aliases`

**同步隐藏邮箱地址 / Sync Hide My Email aliases**

从 Apple 读取指定账户的全部隐藏邮箱地址并刷新 Cookie。

> Read all Hide My Email aliases for an account from Apple and refresh cookies.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Query · accountId |
| 成功响应 | 200 · { aliases } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/icloud/aliases?accountId=icloud_account_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/icloud/aliases/preview catalog:5546549e780d -->
## `POST /api/icloud/aliases/preview`

**预览隐藏邮箱地址 / Preview a Hide My Email address**

让 Apple 生成一个尚未创建的候选隐藏邮箱地址。

> Ask Apple for a suggested Hide My Email address without creating it.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · accountId |
| 成功响应 | 200 · { email, previewId } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/icloud/aliases/preview" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "accountId": "icloud_account_id"
}'
```

<!-- endpoint:POST /api/icloud/aliases catalog:ad957a7191ec -->
## `POST /api/icloud/aliases`

**创建隐藏邮箱地址 / Create a Hide My Email alias**

在指定 iCloud 账户中创建带标签的隐藏地址。

> Create a labeled Hide My Email alias in the selected iCloud account.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · accountId, label?, email?, previewId? |
| 成功响应 | 201 · { alias } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/icloud/aliases" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "accountId": "icloud_account_id",
  "label": "Shopping",
  "email": "suggested@icloud.com",
  "previewId": "00000000-0000-4000-8000-000000000001"
}'
```

<!-- endpoint:PATCH /api/icloud/aliases/:anonymousId catalog:fd74e6b4847c -->
## `PATCH /api/icloud/aliases/{anonymousId}`

**停用或恢复隐藏地址 / Deactivate or reactivate an alias**

对指定 Apple anonymousId 执行停用或恢复。

> Deactivate or reactivate the selected Apple anonymousId.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · anonymousId; JSON · accountId, action=deactivate\|reactivate |
| 成功响应 | 200 · { ok: true, action } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/icloud/aliases/alias_id" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "accountId": "icloud_account_id",
  "action": "deactivate"
}'
```

<!-- endpoint:DELETE /api/icloud/aliases/:anonymousId catalog:762654e2793c -->
## `DELETE /api/icloud/aliases/{anonymousId}`

**永久删除隐藏地址 / Permanently delete an alias**

从 Apple 永久删除指定隐藏地址并刷新账户统计。

> Permanently delete the alias from Apple and refresh account statistics.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · anonymousId; JSON · accountId |
| 成功响应 | 200 · { ok: true } |

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/icloud/aliases/alias_id" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "accountId": "icloud_account_id"
}'
```

<!-- endpoint:GET /api/icloud/inbox catalog:5b5583941f1f -->
## `GET /api/icloud/inbox`

**读取 iCloud 最近来信 / List recent iCloud mail**

通过 IMAP 读取或搜索最近邮件摘要；Web 回退仅过滤当前摘要。

> Read or search recent IMAP message summaries; Web fallback filters current summaries only.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Query · accountId, alias?, q?, limit=1..50?, days=0..365? |
| 成功响应 | 200 · { messages, method=imap\|web } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/icloud/inbox?accountId=icloud_account_id&limit=20&days=7" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/icloud/inbox/:uid catalog:03d3ee97229b -->
## `GET /api/icloud/inbox/{uid}`

**读取 iCloud 邮件正文 / Read an iCloud message**

通过 IMAP UID 读取完整正文，并将未读邮件同步标记为 Seen。

> Read full content by IMAP UID and synchronize unread mail to Seen.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · uid; Query · accountId |
| 成功响应 | 200 · { message: { …, isRead=true } } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/icloud/inbox/123?accountId=icloud_account_id" \
  --header "Authorization: Bearer om_at_..."
```
