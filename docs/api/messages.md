<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# 邮件

**Messages**

列表、详情、状态、附件、原文、发信、回复和翻译。

> Lists, details, state, attachments, raw source, sending, replies, and translation.

本分类共 **11** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。

<!-- endpoint:GET /api/mail-notifications catalog:99e8ea3dcf96 -->
## `GET /api/mail-notifications`

**读取统一新邮件通知摘要 / Read unified new-mail notification summaries**

从 OmniMail 及已启用的外部邮箱索引读取统一的新邮件摘要，供浏览器扩展轮询提醒。

> Read unified new-mail summaries from OmniMail and enabled external-mail indexes for extension polling.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Query · sources?, limit=1..100? |
| 成功响应 | 200 · { messages, sources, unread } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/mail-notifications?limit=50&sources=icloud,linuxdo" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/messages catalog:4a9a3a6e92c2 -->
## `GET /api/messages`

**查询邮件列表 / Query messages**

按文件夹、搜索词、邮箱或域名筛选，并使用不透明游标分页。

> Filter by folder, query, mailbox, or domain and paginate with an opaque cursor.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Query · folder, q?, mailbox?, domain?, limit=1..100?, cursor?, version? |
| 成功响应 | 200 · { messages, counts, page, version, unchanged } |

> 注意：翻页期间必须保持筛选参数不变；cursor 不能解析或修改。
>
> Note: Keep filters unchanged while paging; do not parse or modify cursor.

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/messages?folder=inbox&limit=30" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/messages catalog:eab2e37e9ae8 -->
## `POST /api/messages`

**主动发送邮件 / Send a message**

通过当前域名配置的发信服务发送，并把结果保存到已发送。

> Send through the provider configured for the domain and save the result to Sent.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · mailboxAddress, to, subject, text, idempotencyKey |
| 成功响应 | 200/202 · { message } |

> 注意：需要发信权限；相同 idempotencyKey 不会重复投递或重复计入限速。
>
> Note: Requires send permission; the same idempotencyKey is not delivered or rate-counted twice.

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/messages" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "mailboxAddress": "owner@example.com",
  "to": "friend@example.net",
  "subject": "Hello",
  "text": "Message body",
  "idempotencyKey": "request_12345678"
}'
```

<!-- endpoint:PATCH /api/messages/bulk catalog:a1446a4a9bfc -->
## `PATCH /api/messages/bulk`

**批量更新邮件 / Bulk-update messages**

一次更新最多 50 封当前用户邮件的已读、星标、文件夹或删除状态。

> Update read, star, folder, or deletion state for up to 50 current-user messages.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · ids[1..50], action=read\|unread\|star\|unstar\|trash\|restore\|delete |
| 成功响应 | 200 · { ok, updatedCount } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/messages/bulk" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "ids": [
    "message_1",
    "message_2"
  ],
  "action": "read"
}'
```

<!-- endpoint:GET /api/messages/:id catalog:ca35f9125cb2 -->
## `GET /api/messages/{id}`

**读取邮件详情 / Read message details**

读取正文、附件元数据和按时间排序的会话摘要。

> Read message content, attachment metadata, and chronological thread summaries.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { message, thread } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/messages/resource_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:PATCH /api/messages/:id catalog:b7a9727b2d36 -->
## `PATCH /api/messages/{id}`

**更新邮件状态 / Update message state**

修改已读、星标或文件夹状态，移入垃圾箱时计算清理日期。

> Change read, star, or folder state and calculate purge time when moving to Trash.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · isRead?, isStarred?, folder=inbox\|sent\|trash? |
| 成功响应 | 200 · { ok: true } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/messages/resource_id" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "isRead": true,
  "isStarred": true
}'
```

<!-- endpoint:DELETE /api/messages/:id catalog:9fa0fac8532f -->
## `DELETE /api/messages/{id}`

**永久删除垃圾箱邮件 / Permanently delete a Trash message**

永久删除当前用户垃圾箱中的邮件、原文、正文和附件。

> Permanently delete a current-user Trash message, raw source, body, and attachments.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { ok: true } |

> 注意：只有已经位于垃圾箱的邮件可以永久删除。
>
> Note: Only messages already in Trash can be permanently deleted.

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/messages/resource_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/messages/:messageId/attachments/:attachmentId catalog:1b3b0fb5cbb8 -->
## `GET /api/messages/{messageId}/attachments/{attachmentId}`

**下载或预览附件 / Download or preview an attachment**

读取当前用户邮件附件；preview=1 时使用受限内联响应。

> Read a current-user attachment; preview=1 returns a restricted inline response.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · messageId, attachmentId; Query · preview=1? |
| 成功响应 | 200 · attachment bytes |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/messages/message_id/attachments/attachment_id?preview=1" \
  --header "Authorization: Bearer om_at_..." \
  --output "attachment.bin"
```

<!-- endpoint:GET /api/messages/:id/raw catalog:9dcf14e7015f -->
## `GET /api/messages/{id}/raw`

**下载原始 EML / Download raw EML**

下载当前用户邮件的原始 RFC 822 内容。

> Download the original RFC 822 source for a current-user message.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · message/rfc822 |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/messages/resource_id/raw" \
  --header "Authorization: Bearer om_at_..." \
  --output "message.eml"
```

<!-- endpoint:POST /api/messages/:id/reply catalog:18c09a4bc2a4 -->
## `POST /api/messages/{id}/reply`

**回复邮件 / Reply to a message**

在线程内回复；可使用 JSON，带附件时改用 multipart/form-data。

> Reply in-thread using JSON, or multipart/form-data when attachments are included.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · text, idempotencyKey; or multipart · text, idempotencyKey, attachments[] |
| 成功响应 | 200/202 · { message } |

> 注意：需要回信权限；最多 5 个附件，单个 5 MiB、合计 10 MiB。
>
> Note: Requires reply permission; up to 5 attachments, 5 MiB each and 10 MiB total.

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/messages/resource_id/reply" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "text": "Thanks!",
  "idempotencyKey": "reply_12345678"
}'
```

<!-- endpoint:POST /api/messages/:id/translation catalog:39fbffafd2ce -->
## `POST /api/messages/{id}/translation`

**翻译邮件正文 / Translate message content**

使用 Workers AI 翻译正文并缓存翻译结果。

> Translate message content with Workers AI and cache the result.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · targetLanguage, sourceLanguage? |
| 成功响应 | 200 · { translation } |

> 注意：账户必须由管理员启用翻译权限。
>
> Note: The account must have translation permission enabled by an administrator.

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/messages/resource_id/translation" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "targetLanguage": "en",
  "sourceLanguage": "zh"
}'
```
