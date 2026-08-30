<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# 管理员：设置、备份与版本

**Admin: settings, backups, and version**

全局策略、存储、备份浏览和系统更新。

> Global policies, storage, backup browsing, and system updates.

本分类共 **17** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。

<!-- endpoint:PATCH /api/admin/settings/registration catalog:3c1ee70c1d82 -->
## `PATCH /api/admin/settings/registration`

**设置外部注册 / Configure public registration**

开启或关闭外部注册，并选择密码或 Linux DO 注册方式。

> Enable or disable public registration and select password or Linux DO registration.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · enabled, method=password\|linuxdo |
| 成功响应 | 200 · { registrationEnabled, registrationMethod } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/settings/registration" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "enabled": true,
  "method": "password"
}'
```

<!-- endpoint:PATCH /api/admin/settings/registration-domains catalog:5d32d984ac7f -->
## `PATCH /api/admin/settings/registration-domains`

**设置注册邮箱后缀 / Configure registration email domains**

配置最多 100 个允许或禁止注册的邮箱后缀。

> Configure up to 100 allowed or blocked registration email domains.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · mode=blocklist\|allowlist, domains[] |
| 成功响应 | 200 · { registrationDomainPolicy } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/settings/registration-domains" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "mode": "blocklist",
  "domains": [
    "mailinator.com"
  ]
}'
```

<!-- endpoint:PATCH /api/admin/settings/mail-refresh catalog:53740a119b4e -->
## `PATCH /api/admin/settings/mail-refresh`

**设置自动刷新间隔 / Configure automatic refresh**

设置所有 Web 用户的收件箱轮询间隔。

> Set the Inbox polling interval for all web users.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · interval=0\|5\|10\|30\|60\|120 |
| 成功响应 | 200 · { mailRefreshInterval } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/settings/mail-refresh" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "interval": 30
}'
```

<!-- endpoint:PATCH /api/admin/settings/mail-workspaces catalog:b09315818b2e -->
## `PATCH /api/admin/settings/mail-workspaces`

**设置邮箱功能入口 / Configure mailbox workspace entries**

控制各可选邮箱工作区是否显示在 OmniMail 导航中。

> Control whether each optional mailbox workspace appears in OmniMail navigation.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · iCloudWorkspaceEnabled, linuxDoMailWorkspaceEnabled, gmailWorkspaceEnabled, microsoftWorkspaceEnabled, qqMailWorkspaceEnabled, naverMailWorkspaceEnabled |
| 成功响应 | 200 · all workspace switches |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/settings/mail-workspaces" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "iCloudWorkspaceEnabled": true,
  "linuxDoMailWorkspaceEnabled": true,
  "gmailWorkspaceEnabled": true,
  "microsoftWorkspaceEnabled": true,
  "qqMailWorkspaceEnabled": true,
  "naverMailWorkspaceEnabled": false
}'
```

<!-- endpoint:PATCH /api/admin/settings/remote-images catalog:bd75cd747fa7 -->
## `PATCH /api/admin/settings/remote-images`

**设置远程图片策略 / Configure remote-image policy**

控制 HTML 邮件是否默认通过安全代理加载外部图片。

> Control whether HTML mail loads external images through the safe proxy by default.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · enabled |
| 成功响应 | 200 · { remoteImagesEnabled } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/settings/remote-images" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "enabled": false
}'
```

<!-- endpoint:PATCH /api/admin/settings/unassigned-mail catalog:5de9ff3158fb -->
## `PATCH /api/admin/settings/unassigned-mail`

**设置无人收件 / Configure unassigned mail**

控制未创建地址的来信是否进入主管理员收件箱。

> Control whether mail for uncreated addresses enters the owner Inbox.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · enabled |
| 成功响应 | 200 · { unassignedMailEnabled } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/settings/unassigned-mail" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "enabled": true
}'
```

<!-- endpoint:PATCH /api/admin/settings/official-extension catalog:284286cdeb47 -->
## `PATCH /api/admin/settings/official-extension`

**启用官方浏览器扩展 / Enable the official browser extension**

允许固定 Chrome Web Store 扩展 ID 使用授权流程。

> Allow the fixed Chrome Web Store extension ID to use the authorization flow.

| 项目 | 内容 |
| --- | --- |
| 认证 | 仅主管理员 |
| 请求 | JSON · enabled |
| 成功响应 | 200 · { officialExtensionEnabled } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/settings/official-extension" \
  --header "Authorization: Bearer om_at_owner..." \
  --header "Content-Type: application/json" \
  --data '{
  "enabled": true
}'
```

<!-- endpoint:PATCH /api/admin/settings/random-mailbox-prefix catalog:874aa26f3529 -->
## `PATCH /api/admin/settings/random-mailbox-prefix`

**设置随机邮箱前缀 / Configure random mailbox prefix**

设置快速生成随机地址时使用的固定前缀。

> Set the fixed prefix used when generating random mailbox addresses.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · prefix |
| 成功响应 | 200 · { randomMailboxPrefix } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/settings/random-mailbox-prefix" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "prefix": "omni-"
}'
```

<!-- endpoint:GET /api/admin/settings/outbound-rate-limit catalog:2c5bc4dd0dd6 -->
## `GET /api/admin/settings/outbound-rate-limit`

**读取全局发信限速 / Read global sending limits**

读取全局开关、每分钟和每日默认发信限额。

> Read the global switch and default per-minute and daily send limits.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | No parameters |
| 成功响应 | 200 · { outboundRateLimit } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/settings/outbound-rate-limit" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:PATCH /api/admin/settings/outbound-rate-limit catalog:956d84e45360 -->
## `PATCH /api/admin/settings/outbound-rate-limit`

**更新全局发信限速 / Update global sending limits**

设置是否启用限速以及全局每分钟、每日限额。

> Set whether rate limiting is enabled and the global minute and daily limits.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · enabled, minuteLimit=1..100, dayLimit=1..10000 |
| 成功响应 | 200 · { outboundRateLimit } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/settings/outbound-rate-limit" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "enabled": true,
  "minuteLimit": 10,
  "dayLimit": 200
}'
```

<!-- endpoint:GET /api/admin/settings/storage catalog:4c9d44c31d65 -->
## `GET /api/admin/settings/storage`

**读取存储与保留策略 / Read storage and retention policy**

读取备份、保留期、默认配额、草稿上限和最近备份状态。

> Read backup, retention, default quota, draft limits, and latest backup state.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | No parameters |
| 成功响应 | 200 · { storagePolicy } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/settings/storage" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:PATCH /api/admin/settings/storage catalog:4e20c07ff209 -->
## `PATCH /api/admin/settings/storage`

**更新存储与保留策略 / Update storage and retention policy**

更新备份开关、各类保留期、默认配额和分角色草稿上限。

> Update backup, retention periods, default quotas, and role-based draft limits.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · backupEnabled?, trashRetentionDays?, temporaryDataRetentionDays?, auditRetentionDays?, failedMessageRetentionDays?, defaultUserQuotaMiB?, defaultTemporaryQuotaMiB?, draftLimits? |
| 成功响应 | 200 · { storagePolicy } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/admin/settings/storage" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "backupEnabled": true,
  "trashRetentionDays": 30,
  "temporaryDataRetentionDays": 7,
  "auditRetentionDays": 180,
  "failedMessageRetentionDays": 7,
  "defaultUserQuotaMiB": 1024,
  "defaultTemporaryQuotaMiB": 256,
  "draftLimits": {
    "superAdmin": 5,
    "admin": 5,
    "user": 5,
    "temporary": 3
  }
}'
```

<!-- endpoint:POST /api/admin/backups catalog:1933640bf86a -->
## `POST /api/admin/backups`

**启动手动备份 / Start a manual backup**

启动一次 D1 与邮件归档备份 Workflow。

> Start a D1 and mail-archive backup Workflow run.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | No body |
| 成功响应 | 202 · { id } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/admin/backups" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:GET /api/admin/backups/objects catalog:fbcbfa39800e -->
## `GET /api/admin/backups/objects`

**浏览备份对象 / Browse backup objects**

主管理员按前缀和游标浏览 BACKUP_BUCKET 对象。

> Let the owner browse BACKUP_BUCKET objects by prefix and cursor.

| 项目 | 内容 |
| --- | --- |
| 认证 | 仅主管理员 |
| 请求 | Query · prefix?, limit?, cursor? |
| 成功响应 | 200 · { objects, page } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/backups/objects?prefix=d1%2Fdaily%2F&limit=30" \
  --header "Authorization: Bearer om_at_owner..."
```

<!-- endpoint:GET /api/admin/backups/download catalog:a4b816612299 -->
## `GET /api/admin/backups/download`

**下载备份对象 / Download a backup object**

主管理员下载经过安全路径校验的指定备份对象。

> Let the owner download a validated backup object path.

| 项目 | 内容 |
| --- | --- |
| 认证 | 仅主管理员 |
| 请求 | Query · key |
| 成功响应 | 200 · backup bytes |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/backups/download?key=d1%2Fdaily%2Fbackup.sql" \
  --header "Authorization: Bearer om_at_owner..." \
  --output "backup.sql"
```

<!-- endpoint:POST /api/admin/backups/drill catalog:acd359c028e5 -->
## `POST /api/admin/backups/drill`

**执行备份结构演练 / Run a backup structure drill**

只读解析指定备份并校验结构，不导入或覆盖生产数据。

> Parse and validate a backup read-only without importing or overwriting production data.

| 项目 | 内容 |
| --- | --- |
| 认证 | 仅主管理员 |
| 请求 | JSON · key |
| 成功响应 | 200 · { result } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/admin/backups/drill" \
  --header "Authorization: Bearer om_at_owner..." \
  --header "Content-Type: application/json" \
  --data '{
  "key": "d1/daily/backup.sql"
}'
```

<!-- endpoint:GET /api/admin/version catalog:53522d6cddea -->
## `GET /api/admin/version`

**检查系统版本 / Check the system version**

读取当前版本与最新 GitHub Release，供管理员手动同步 Fork。

> Read the current version and latest GitHub Release so administrators can sync their forks manually.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | No parameters |
| 成功响应 | 200 · { currentVersion, latestVersion, updateAvailable, releaseUrl } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/admin/version" \
  --header "Authorization: Bearer om_at_admin..."
```
