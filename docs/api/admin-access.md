<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# 管理员：用户与访问

**Admin: users and access**

邀请、用户、用户限速和收件域名管理。

> Invitations, users, user rate limits, and receiving-domain management.

本分类共 **11** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。

<!-- endpoint:GET /api/admin/invites catalog:208df68a46d2 -->
## `GET /api/admin/invites`

**查询邀请记录 / Query invitations**

分页读取管理员创建的邀请、使用次数、状态和权限策略。

> Page through invitations with usage, status, and policy details.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | Query · limit?, cursor? |
| 成功响应 | 200 · { invites, page } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/invites?limit=30" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:POST /api/admin/invites catalog:494316649e22 -->
## `POST /api/admin/invites`

**创建账户邀请 / Create an account invitation**

创建单次或多次、指定地址或自选地址的用户邀请。

> Create single- or multi-use invitations with assigned or self-selected addresses.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · domain, accountRole, expiresInHours, accountLifetimeHours?, multiUse, addressMode, assignedLocalPart?, mailboxLimit, canCreateMailboxes, canReply, canTranslate |
| 成功响应 | 201 · { invite, token } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/admin/invites" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "domain": "example.com",
  "accountRole": "user",
  "expiresInHours": 24,
  "accountLifetimeHours": 0,
  "multiUse": false,
  "addressMode": "self_selected",
  "assignedLocalPart": "",
  "mailboxLimit": 1,
  "canCreateMailboxes": true,
  "canReply": false,
  "canTranslate": false
}'
```

<!-- endpoint:PATCH /api/admin/invites/:id/revoke catalog:df16b860293f -->
## `PATCH /api/admin/invites/{id}/revoke`

**撤销邀请 / Revoke an invitation**

立即使指定邀请失效，不影响已创建的账户。

> Invalidate the invitation immediately without changing accounts already created from it.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | Path · id |
| 成功响应 | 200 · { ok: true } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/invites/resource_id/revoke" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:GET /api/admin/users catalog:00be843cd1cf -->
## `GET /api/admin/users`

**查询用户目录 / Query the user directory**

分页读取用户、邮箱数量、配额与发信用量。

> Page through users, mailbox counts, quotas, and sending usage.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | Query · limit?, cursor? |
| 成功响应 | 200 · { users, totals, page } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/users?limit=50" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:POST /api/admin/users catalog:200cb9de2897 -->
## `POST /api/admin/users`

**创建托管用户 / Create a managed user**

由管理员直接创建账户并设置角色、配额和功能权限。

> Let an administrator create an account with role, quota, and feature permissions.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · email, displayName, password, role?, status?, mailboxLimit?, storageQuotaMiB?, canCreateMailboxes?, canReply?, canTranslate? |
| 成功响应 | 201 · { user } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/admin/users" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "email": "member@example.com",
  "displayName": "Member",
  "password": "strong-password",
  "role": "user",
  "status": "active",
  "mailboxLimit": 1,
  "storageQuotaMiB": 1024,
  "canCreateMailboxes": true,
  "canReply": false,
  "canTranslate": false
}'
```

<!-- endpoint:PATCH /api/admin/users/:id catalog:2caa420d1248 -->
## `PATCH /api/admin/users/{id}`

**更新用户策略 / Update a user policy**

修改非主管理员用户的角色、状态、邮箱上限、配额和能力。

> Change role, status, mailbox limit, quota, and capabilities for a non-owner user.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | Path · id; JSON · role?, status?, mailboxLimit?, storageQuotaMiB?, canCreateMailboxes?, canReply?, canTranslate? |
| 成功响应 | 200 · { user } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/users/resource_id" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "status": "active",
  "mailboxLimit": 3,
  "canReply": true
}'
```

<!-- endpoint:PATCH /api/admin/users/:id/outbound-rate-limit catalog:05b21257558a -->
## `PATCH /api/admin/users/{id}/outbound-rate-limit`

**覆盖用户发信限速 / Override a user sending limit**

为指定用户设置每分钟和每日限额；null 表示继承全局值。

> Set per-minute and daily limits for a user; null inherits the global value.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | Path · id; JSON · minuteLimit: number\|null, dayLimit: number\|null |
| 成功响应 | 200 · { outboundRateLimit } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/users/resource_id/outbound-rate-limit" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "minuteLimit": 5,
  "dayLimit": 100
}'
```

<!-- endpoint:POST /api/admin/users/:id/outbound-rate-limit/reset catalog:d1f9739821bb -->
## `POST /api/admin/users/{id}/outbound-rate-limit/reset`

**清零用户发信计数 / Reset a user sending counter**

清零指定用户当前分钟和 UTC 自然日的发信计数。

> Reset the user’s current minute and UTC-day send counters.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | Path · id |
| 成功响应 | 200 · { outboundRateLimit } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/admin/users/resource_id/outbound-rate-limit/reset" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:POST /api/admin/domains catalog:f6243e6c8e26 -->
## `POST /api/admin/domains`

**添加收件域名 / Add a receiving domain**

把已配置 Email Routing 的域名加入 OmniMail 管理。

> Add a domain with configured Email Routing to OmniMail management.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · name |
| 成功响应 | 201 · { domain } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/admin/domains" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "name": "example.com"
}'
```

<!-- endpoint:PATCH /api/admin/domains/:name catalog:cfa9489fe5aa -->
## `PATCH /api/admin/domains/{name}`

**启停收件域名 / Enable or disable a receiving domain**

修改域名启用状态，关闭后停止该域名地址的收件和发信。

> Change domain active state; disabling stops receiving and sending for its addresses.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | Path · name; JSON · isActive |
| 成功响应 | 200 · { domain } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/domains/example.com" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "isActive": false
}'
```

<!-- endpoint:DELETE /api/admin/domains/:name catalog:601febfba9b0 -->
## `DELETE /api/admin/domains/{name}`

**删除空域名 / Delete an empty domain**

删除没有邮箱地址的托管域名。

> Delete a managed domain that has no mailbox addresses.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | Path · name |
| 成功响应 | 200 · { ok: true } |

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/admin/domains/example.com" \
  --header "Authorization: Bearer om_at_admin..."
```
