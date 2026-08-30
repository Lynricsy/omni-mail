<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# 管理员：运营与邮件

**Admin: operations and mail**

统计、审计、失败邮件、全站邮件和安全清理。

> Statistics, audit, failed mail, site-wide mail, and controlled cleanup.

本分类共 **12** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。

<!-- endpoint:GET /api/admin/audit-logs catalog:5d813d8d0f57 -->
## `GET /api/admin/audit-logs`

**查询操作日志 / Query audit logs**

按时间、类别和关键词查询脱敏审计记录并游标分页。

> Query sanitized audit records by time, category, and keyword with cursor pagination.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | Query · days?, category=all\|auth\|account\|user\|mailbox\|domain\|invitation\|message\|icloud\|gmail\|microsoft\|qq-mail\|linuxdo-mail\|system?, q?, limit?, cursor? |
| 成功响应 | 200 · { logs, page } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/audit-logs?days=7&category=qq-mail&limit=50" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:GET /api/admin/statistics catalog:df92eba42729 -->
## `GET /api/admin/statistics`

**读取全站统计 / Read site-wide statistics**

返回收件趋势、来源、发件人、平台用量和存储汇总。

> Return receiving trends, sources, senders, platform usage, and storage summaries.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | Query · days=7\|30\|90? |
| 成功响应 | 200 · { summary, daily, sourceDomains, topSenders, platform, storage } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/statistics?days=30" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:GET /api/admin/deployment-check catalog:88ef4e26c9d5 -->
## `GET /api/admin/deployment-check`

**执行部署自检 / Run deployment checks**

检查 D1、R2、队列、Secret 和功能配置，不返回 Secret 明文。

> Check D1, R2, queues, secrets, and feature configuration without returning secret values.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | No parameters |
| 成功响应 | 200 · { groups, ready } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/deployment-check" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:GET /api/admin/failed-messages catalog:372d345b5251 -->
## `GET /api/admin/failed-messages`

**列出解析失败邮件 / List failed messages**

返回仍可重试或需要清理的失败邮件摘要。

> Return failed-message summaries that can be retried or cleaned up.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | No parameters |
| 成功响应 | 200 · { total, messages } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/failed-messages" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:POST /api/admin/failed-messages/:id/retry catalog:d16dfda594e7 -->
## `POST /api/admin/failed-messages/{id}/retry`

**重试失败邮件 / Retry a failed message**

把指定失败邮件重新加入解析队列。

> Requeue the selected failed message for parsing.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | Path · id |
| 成功响应 | 200 · { ok: true } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/admin/failed-messages/resource_id/retry" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:GET /api/admin/mail-cleanup/preview catalog:4ac7e02b7f43 -->
## `GET /api/admin/mail-cleanup/preview`

**预估邮件清理 / Preview mail cleanup**

按范围、类别和邮件年龄计算待清理数量、附件和空间。

> Calculate messages, attachments, and bytes to clean by scope, category, and age.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | Query · scope=all\|user\|mailbox, scopeValue?, category, olderThanDays=1..3650 |
| 成功响应 | 200 · { filter, preview, batchLimit } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/mail-cleanup/preview?scope=all&category=trash&olderThanDays=30" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:POST /api/admin/mail-cleanup catalog:bd5c45f69781 -->
## `POST /api/admin/mail-cleanup`

**执行邮件清理 / Run mail cleanup**

经数量复核后每批永久清理最多 50 封匹配邮件。

> After count confirmation, permanently clean up to 50 matching messages per batch.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · scope, scopeValue?, category, olderThanDays, expectedCount, confirm=true |
| 成功响应 | 200 · { deletedCount, deletedBytes, remainingCount } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/admin/mail-cleanup" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "scope": "all",
  "scopeValue": "",
  "category": "trash",
  "olderThanDays": 30,
  "expectedCount": 12,
  "confirm": true
}'
```

<!-- endpoint:GET /api/admin/messages catalog:53edc2dd995d -->
## `GET /api/admin/messages`

**查询全站邮件 / Query site-wide messages**

主管理员按用户、邮箱、方向、文件夹、状态和时间筛选全站邮件。

> Let the owner filter site-wide mail by user, mailbox, direction, folder, status, and age.

| 项目 | 内容 |
| --- | --- |
| 认证 | 仅主管理员 |
| 请求 | Query · q?, user?, mailbox?, direction?, folder?, status?, days?, limit?, cursor? |
| 成功响应 | 200 · { messages, page } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/messages?folder=inbox&days=30&limit=30" \
  --header "Authorization: Bearer om_at_owner..."
```

<!-- endpoint:PATCH /api/admin/messages/bulk catalog:eb6d330ba128 -->
## `PATCH /api/admin/messages/bulk`

**批量管理全站邮件 / Bulk-manage site-wide messages**

主管理员跨用户批量移入垃圾箱、恢复或永久删除邮件。

> Let the owner move, restore, or permanently delete messages across users.

| 项目 | 内容 |
| --- | --- |
| 认证 | 仅主管理员 |
| 请求 | JSON · ids[1..50], action=trash\|restore\|delete |
| 成功响应 | 200 · { ok, updatedCount } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/messages/bulk" \
  --header "Authorization: Bearer om_at_owner..." \
  --header "Content-Type: application/json" \
  --data '{
  "ids": [
    "message_1",
    "message_2"
  ],
  "action": "trash"
}'
```

<!-- endpoint:GET /api/admin/messages/:messageId/attachments/:attachmentId catalog:b57fe2f3f9c5 -->
## `GET /api/admin/messages/{messageId}/attachments/{attachmentId}`

**读取任意用户附件 / Read any user attachment**

主管理员下载或受限预览全站邮件附件，并写入审计日志。

> Let the owner download or safely preview any attachment and write an audit event.

| 项目 | 内容 |
| --- | --- |
| 认证 | 仅主管理员 |
| 请求 | Path · messageId, attachmentId; Query · preview=1? |
| 成功响应 | 200 · attachment bytes |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/messages/message_id/attachments/attachment_id?preview=1" \
  --header "Authorization: Bearer om_at_owner..." \
  --output "attachment.bin"
```

<!-- endpoint:GET /api/admin/messages/:id/raw catalog:bd5dda5c3f06 -->
## `GET /api/admin/messages/{id}/raw`

**下载任意用户原始邮件 / Download any raw message**

主管理员下载全站邮件的原始 EML，并记录访问审计。

> Let the owner download any raw EML and record an access audit event.

| 项目 | 内容 |
| --- | --- |
| 认证 | 仅主管理员 |
| 请求 | Path · id |
| 成功响应 | 200 · message/rfc822 |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/messages/resource_id/raw" \
  --header "Authorization: Bearer om_at_owner..." \
  --output "message.eml"
```

<!-- endpoint:GET /api/admin/messages/:id catalog:18eb7d3be449 -->
## `GET /api/admin/messages/{id}`

**读取任意用户邮件详情 / Read any message details**

主管理员读取全站邮件正文、所属用户、线程和附件元数据。

> Let the owner read any message body, owner, thread, and attachment metadata.

| 项目 | 内容 |
| --- | --- |
| 认证 | 仅主管理员 |
| 请求 | Path · id |
| 成功响应 | 200 · { message, thread } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/messages/resource_id" \
  --header "Authorization: Bearer om_at_owner..."
```
