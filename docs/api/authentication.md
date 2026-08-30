<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->

# 认证与账户

**Authentication and account**

网页登录、设备令牌、MFA、扩展授权和账户生命周期。

> Web login, device tokens, MFA, extension authorization, and account lifecycle.

本分类共 **20** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。

<!-- endpoint:GET /api/auth/linux-do catalog:1671fbe74574 -->
## `GET /api/auth/linux-do`

**开始 Linux DO 登录 / Start Linux DO sign-in**

生成 OAuth state 并重定向到 Linux DO Connect。

> Create OAuth state and redirect to Linux DO Connect.

| 项目 | 内容 |
| --- | --- |
| 认证 | 公开，无需登录 |
| 请求 | Query · returnTo? (allowed application URL) |
| 成功响应 | 302 · Linux DO authorization URL |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/auth/linux-do?returnTo=https%3A%2F%2Fmail.example.com%2F"
```

<!-- endpoint:GET /api/auth/linux-do/callback catalog:44968b6944a9 -->
## `GET /api/auth/linux-do/callback`

**完成 Linux DO 回调 / Complete the Linux DO callback**

校验 state、交换用户资料并创建或登录账户。

> Validate state, exchange the user profile, and create or sign in the account.

| 项目 | 内容 |
| --- | --- |
| 认证 | 公开，无需登录 |
| 请求 | Query · code, state |
| 成功响应 | 302 · returnTo or MFA login URL |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/auth/linux-do/callback?code=oauth_code&state=oauth_state"
```

<!-- endpoint:POST /api/login catalog:2a0cd2614d26 -->
## `POST /api/login`

**密码登录 / Sign in with a password**

验证邮箱和密码；启用 MFA 时先返回二次验证挑战。

> Verify email and password; return an MFA challenge when MFA is enabled.

| 项目 | 内容 |
| --- | --- |
| 认证 | 公开，无需登录 |
| 请求 | JSON · email, password |
| 成功响应 | 200 · { user } or 202 · { mfaRequired, email } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/login" \
  --header "Content-Type: application/json" \
  --data '{
  "email": "user@example.com",
  "password": "your-password"
}'
```

<!-- endpoint:POST /api/login/mfa catalog:e41f8f84143e -->
## `POST /api/login/mfa`

**完成网页登录 MFA / Complete web-login MFA**

使用挑战 Cookie 和验证码或恢复码完成网页登录。

> Use the challenge cookie plus a verification or recovery code to finish web sign-in.

| 项目 | 内容 |
| --- | --- |
| 认证 | 公开，无需登录 |
| 请求 | Cookie · omnimail_mfa_challenge; JSON · code |
| 成功响应 | 200 · { user } + Set-Cookie |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/login/mfa" \
  --header "Cookie: omnimail_mfa_challenge=..." \
  --header "Content-Type: application/json" \
  --data '{
  "code": "123456"
}'
```

<!-- endpoint:POST /api/auth/token catalog:4d21cc42adbc -->
## `POST /api/auth/token`

**签发设备令牌 / Issue device tokens**

用密码和可选 MFA 签发短期 Access Token 与轮换 Refresh Token。

> Issue a short-lived access token and rotating refresh token using a password and optional MFA.

| 项目 | 内容 |
| --- | --- |
| 认证 | 公开，无需登录 |
| 请求 | JSON · email, password, deviceName, mfaCode? |
| 成功响应 | 200 · { accessToken, expiresIn, refreshToken, refreshExpiresIn, scopes, user } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/auth/token" \
  --header "Content-Type: application/json" \
  --data '{
  "email": "user@example.com",
  "password": "your-password",
  "deviceName": "My automation",
  "mfaCode": "123456"
}'
```

<!-- endpoint:POST /api/auth/token/refresh catalog:3461819cc6af -->
## `POST /api/auth/token/refresh`

**轮换设备令牌 / Rotate device tokens**

使用有效 Refresh Token 同时轮换 Access Token 和 Refresh Token。

> Use a valid refresh token to rotate both the access and refresh tokens.

| 项目 | 内容 |
| --- | --- |
| 认证 | 公开，无需登录 |
| 请求 | JSON · refreshToken |
| 成功响应 | 200 · new token pair |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/auth/token/refresh" \
  --header "Content-Type: application/json" \
  --data '{
  "refreshToken": "om_rt_..."
}'
```

<!-- endpoint:POST /api/auth/token/revoke catalog:2cf0a912de80 -->
## `POST /api/auth/token/revoke`

**撤销 Refresh Token / Revoke a refresh token**

幂等撤销指定设备会话，即使已经撤销也返回成功。

> Idempotently revoke the device session, including when it is already revoked.

| 项目 | 内容 |
| --- | --- |
| 认证 | 公开，无需登录 |
| 请求 | JSON · refreshToken |
| 成功响应 | 200 · { ok: true } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/auth/token/revoke" \
  --header "Content-Type: application/json" \
  --data '{
  "refreshToken": "om_rt_..."
}'
```

<!-- endpoint:POST /api/auth/extension/authorize catalog:098dd4268fdb -->
## `POST /api/auth/extension/authorize`

**创建扩展授权码 / Create an extension authorization code**

由已登录网页确认扩展、回调地址和 PKCE challenge。

> Use the signed-in website to approve the extension, redirect URI, and PKCE challenge.

| 项目 | 内容 |
| --- | --- |
| 认证 | 浏览器 Session Cookie |
| 请求 | Same-origin Cookie; JSON · clientId, redirectUri, state, codeChallenge |
| 成功响应 | 200 · { redirectTo } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/auth/extension/authorize" \
  --cookie "omnimail_session=..." \
  --header "Content-Type: application/json" \
  --data '{
  "clientId": "abcdefghijklmnopabcdefghijklmnop",
  "redirectUri": "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/omnimail",
  "state": "state_value_32_characters_long_123",
  "codeChallenge": "pkce_challenge_43_characters_long_value____"
}'
```

<!-- endpoint:POST /api/auth/extension/exchange catalog:1ca3096b405c -->
## `POST /api/auth/extension/exchange`

**交换扩展授权码 / Exchange an extension authorization code**

扩展使用一次性授权码和 PKCE verifier 换取受限设备令牌。

> Exchange a one-time authorization code and PKCE verifier for scoped device tokens.

| 项目 | 内容 |
| --- | --- |
| 认证 | 公开，无需登录 |
| 请求 | Extension Origin; JSON · code, codeVerifier, clientId, redirectUri |
| 成功响应 | 200 · scoped token pair |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/auth/extension/exchange" \
  --header "Origin: chrome-extension://abcdefghijklmnopabcdefghijklmnop" \
  --header "Content-Type: application/json" \
  --data '{
  "code": "om_ac_...",
  "codeVerifier": "pkce_verifier_43_characters_long_value_____",
  "clientId": "abcdefghijklmnopabcdefghijklmnop",
  "redirectUri": "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/omnimail"
}'
```

<!-- endpoint:GET /api/session catalog:5da460accaa2 -->
## `GET /api/session`

**查询当前会话 / Read the current session**

接受浏览器 Cookie 或 Bearer Token；未登录时 user 为 null。

> Accept a browser cookie or bearer token; user is null when signed out.

| 项目 | 内容 |
| --- | --- |
| 认证 | 可选登录；登录后可能返回更多当前用户信息 |
| 请求 | Optional · Cookie or Authorization header |
| 成功响应 | 200 · { user: User \| null } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/session"
```

<!-- endpoint:POST /api/client-errors catalog:e6fc480128c4 -->
## `POST /api/client-errors`

**记录客户端异常 / Record a client error**

接收已登录客户端的安全化崩溃摘要，并写入 Cloudflare Workers Logs。

> Accept a sanitized crash summary from an authenticated client and write it to Cloudflare Workers Logs.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · crashId, errorName, message, componentStack, path |
| 成功响应 | 204 · No Content |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/client-errors" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "crashId": "ui-m123abc",
  "errorName": "TypeError",
  "message": "Render failed",
  "componentStack": "at Mailbox",
  "path": "/mail/inbox"
}'
```

<!-- endpoint:POST /api/logout catalog:d9ea142047c6 -->
## `POST /api/logout`

**退出当前会话 / Sign out the current session**

删除浏览器会话，或撤销当前 Bearer 设备会话。

> Delete the browser session or revoke the current bearer device session.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | No body |
| 成功响应 | 200 · { ok: true } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/logout" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:GET /api/auth/devices catalog:bd63b1693e57 -->
## `GET /api/auth/devices`

**列出设备会话 / List device sessions**

列出当前用户的设备、Scope、最近使用和撤销状态，不返回令牌明文。

> List the current user’s devices, scopes, last use, and revocation state without plaintext tokens.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | No parameters |
| 成功响应 | 200 · { devices } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/auth/devices" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:DELETE /api/auth/devices/:id catalog:59428a6227f0 -->
## `DELETE /api/auth/devices/{id}`

**撤销指定设备 / Revoke a device session**

撤销当前用户拥有的一个设备会话。

> Revoke one device session owned by the current user.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | Path · id |
| 成功响应 | 200 · { ok: true } |

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/auth/devices/resource_id" \
  --header "Authorization: Bearer om_at_..."
```

<!-- endpoint:PATCH /api/account catalog:80f9399e3f26 -->
## `PATCH /api/account`

**更新账户资料或密码 / Update profile or password**

修改显示名称，或验证当前密码后设置新密码并撤销全部设备令牌。

> Change the display name, or verify the current password, set a new password, and revoke device tokens.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · displayName?; currentPassword + newPassword? |
| 成功响应 | 200 · { user } |

### cURL 示例

```bash
curl --request PATCH \
  --url "https://mail.example.com/api/account" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "displayName": "New Name"
}'
```

<!-- endpoint:DELETE /api/account catalog:9e997972e946 -->
## `DELETE /api/account`

**注销当前账户 / Delete the current account**

普通用户用登录邮箱确认；临时用户用当前密码确认。管理员不能自助注销。

> Regular users confirm with email; temporary users confirm with password. Administrators cannot self-delete.

| 项目 | 内容 |
| --- | --- |
| 认证 | 登录用户；支持 Session Cookie 或 Access Token |
| 请求 | JSON · confirmationEmail? or currentPassword? |
| 成功响应 | 200 · { ok: true } + cleared sessions |

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/account" \
  --header "Authorization: Bearer om_at_..." \
  --header "Content-Type: application/json" \
  --data '{
  "confirmationEmail": "user@example.com"
}'
```

<!-- endpoint:GET /api/account/mfa catalog:c9fa3980ac1d -->
## `GET /api/account/mfa`

**读取 MFA 状态 / Read MFA status**

返回 MFA 是否可配置、是否启用和剩余恢复码数量。

> Return whether MFA is available, enabled, and how many recovery codes remain.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | No parameters |
| 成功响应 | 200 · { ready, enabled, recoveryCodesRemaining } |

### cURL 示例

```bash
curl --request GET \
  --url "https://mail.example.com/api/account/mfa" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:POST /api/account/mfa/setup catalog:360f2a405760 -->
## `POST /api/account/mfa/setup`

**开始 MFA 配置 / Start MFA setup**

生成一次性 TOTP Secret、二维码 URI 和设置期限。

> Generate a temporary TOTP secret, QR URI, and setup expiry.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | No body |
| 成功响应 | 200 · { secret, uri } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/account/mfa/setup" \
  --header "Authorization: Bearer om_at_admin..."
```

<!-- endpoint:POST /api/account/mfa/confirm catalog:11f4017c9f7d -->
## `POST /api/account/mfa/confirm`

**确认启用 MFA / Confirm MFA setup**

验证当前 TOTP 后启用 MFA，并仅返回一次恢复码。

> Verify the current TOTP, enable MFA, and return recovery codes once.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · code |
| 成功响应 | 200 · { enabled: true, recoveryCodes } |

### cURL 示例

```bash
curl --request POST \
  --url "https://mail.example.com/api/account/mfa/confirm" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "code": "123456"
}'
```

<!-- endpoint:DELETE /api/account/mfa catalog:875ad70da60d -->
## `DELETE /api/account/mfa`

**关闭 MFA / Disable MFA**

使用有效 TOTP 或恢复码关闭 MFA 并清除恢复码。

> Disable MFA with a valid TOTP or recovery code and clear recovery codes.

| 项目 | 内容 |
| --- | --- |
| 认证 | 管理员或主管理员 |
| 请求 | JSON · code |
| 成功响应 | 200 · { enabled: false } |

### cURL 示例

```bash
curl --request DELETE \
  --url "https://mail.example.com/api/account/mfa" \
  --header "Authorization: Bearer om_at_admin..." \
  --header "Content-Type: application/json" \
  --data '{
  "code": "123456"
}'
```
