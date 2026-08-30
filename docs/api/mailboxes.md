<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# 域名与邮箱地址

**Domains and mailboxes**

读取域名并创建、启停、切换或删除邮箱地址。

> Read domains and create, enable, switch, or delete mailbox addresses.

本分类共 **5** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。

<!-- endpoint:GET /api/domains catalog:e04a28567ea7 -->
## `GET /api/domains`

**读取可用收件域名 / List available receiving domains**

返回当前实例中的域名及其启用状态和邮箱数量。

> Return instance domains with active state and mailbox counts.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | No parameters |
| 成功响应 | 200 · { domains } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/domains" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/mailboxes catalog:9c83eb646b31 -->
## `GET /api/mailboxes`

**列出当前用户邮箱 / List current-user mailboxes**

返回当前用户可见的邮箱地址、主邮箱和启用状态。

> Return visible mailbox addresses, the primary mailbox, and active state.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | No parameters |
| 成功响应 | 200 · { mailboxes } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/mailboxes" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:POST /api/mailboxes catalog:5c9c6afa1219 -->
## `POST /api/mailboxes`

**创建邮箱地址 / Create a mailbox address**

在启用域名下创建地址；受角色权限、邮箱上限和地址规则限制。

> Create an address on an active domain, subject to role, quota, and address rules.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · address |
| 成功响应 | 200/201 · { mailbox } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/mailboxes" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "address": "owner@example.com"
}'
```

<!-- endpoint:PATCH /api/mailboxes/:address catalog:91d54c8af03e -->
## `PATCH /api/mailboxes/{address}`

**启停邮箱或设为主邮箱 / Enable, disable, or make a mailbox primary**

更新拥有的邮箱地址；停用或设主地址时会执行安全约束。

> Update an owned mailbox while enforcing disable and primary-address safeguards.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · address; JSON · isActive? or isPrimary? |
| 成功响应 | 200 · { mailbox } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/mailboxes/owner%40example.com" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "isPrimary": true
}'
```

<!-- endpoint:DELETE /api/mailboxes/:address catalog:14fb4b9e7ea0 -->
## `DELETE /api/mailboxes/{address}`

**删除非主邮箱 / Delete a non-primary mailbox**

立即隐藏非主邮箱，并启动邮件、草稿和附件的异步清理。

> Hide a non-primary mailbox immediately and start asynchronous mail, draft, and attachment cleanup.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · address |
| 成功响应 | 202 · { ok: true } |

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/mailboxes/owner%40example.com" \
  --header "Authorization: Bearer om_at_..."
```
