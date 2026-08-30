<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# 草稿与附件

**Drafts and attachments**

服务端草稿的创建、保存、附件和幂等发送。

> Create, save, attach files to, and idempotently send server drafts.

本分类共 **8** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。

<!-- endpoint:GET /api/drafts catalog:589c50c14534 -->
## `GET /api/drafts`

**列出草稿 / List drafts**

读取当前用户保留的服务端草稿摘要。

> Read server-side draft summaries retained for the current user.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | No parameters |
| 成功响应 | 200 · { drafts, limit } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/drafts" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/drafts catalog:ef465a7e8e10 -->
## `POST /api/drafts`

**创建草稿 / Create a draft**

创建服务端草稿，超过角色上限时自动清理最早草稿。

> Create a server-side draft and prune the oldest draft when the role limit is exceeded.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · mailboxAddress, to, subject, text |
| 成功响应 | 200 · { draft } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/drafts" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "mailboxAddress": "owner@example.com",
  "to": "friend@example.net",
  "subject": "Draft subject",
  "text": "Draft body"
}'
```

<!-- endpoint:GET /api/drafts/:id catalog:3fcd3f71056c -->
## `GET /api/drafts/{id}`

**读取草稿详情 / Read a draft**

读取拥有的草稿及附件元数据。

> Read an owned draft and its attachment metadata.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { draft } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/drafts/resource_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:PUT /api/drafts/:id catalog:301891d7c4e7 -->
## `PUT /api/drafts/{id}`

**保存草稿 / Save a draft**

完整保存发件邮箱、收件人、主题和正文。

> Replace the sending mailbox, recipient, subject, and body.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · mailboxAddress, to, subject, text |
| 成功响应 | 200 · { draft } |

### cURL 示例

```bash
curl --request PUT \
  --url "https://mail.example.com/api/drafts/resource_id" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "mailboxAddress": "owner@example.com",
  "to": "friend@example.net",
  "subject": "Updated subject",
  "text": "Updated body"
}'
```

<!-- endpoint:DELETE /api/drafts/:id catalog:d9582600254c -->
## `DELETE /api/drafts/{id}`

**丢弃草稿 / Discard a draft**

删除拥有的草稿及其全部附件对象。

> Delete an owned draft and all of its attachment objects.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { ok: true } |

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/drafts/resource_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/drafts/:id/attachments catalog:ea61ff7b3331 -->
## `POST /api/drafts/{id}/attachments`

**上传草稿附件 / Upload a draft attachment**

以 multipart/form-data 上传一个附件并计入用户存储配额。

> Upload one attachment as multipart/form-data and count it against user storage.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | multipart/form-data · file |
| 成功响应 | 201 · { attachment } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/drafts/resource_id/attachments" \
  --header "Authorization: Bearer om_at_..." \
  --form "file=@./document.pdf"
```

<!-- endpoint:DELETE /api/drafts/:id/attachments/:attachmentId catalog:850452602602 -->
## `DELETE /api/drafts/{id}/attachments/{attachmentId}`

**删除草稿附件 / Delete a draft attachment**

删除拥有的草稿附件并释放存储空间。

> Delete an owned draft attachment and release storage.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id, attachmentId |
| 成功响应 | 200 · { ok: true } |

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/drafts/resource_id/attachments/attachment_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/drafts/:id/send catalog:33fa8fc71286 -->
## `POST /api/drafts/{id}/send`

**发送草稿 / Send a draft**

幂等发送草稿和附件，成功入队后删除草稿。

> Idempotently send the draft and attachments, then delete the draft after queueing.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id; JSON · idempotencyKey |
| 成功响应 | 200/202 · { message } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/drafts/resource_id/send" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "idempotencyKey": "draft_12345678"
}'
```
