# OmniMail 可观测性

OmniMail 使用 Cloudflare Workers Logs 记录结构化运行事件。`wrangler.jsonc` 已启用
100% 日志采样；日志不记录邮箱授权码、应用密码、邮件主题、正文、附件名或服务器响应原文。

## 查看日志

在 Cloudflare Dashboard 打开 **Workers & Pages → omni-mail → Observability → Logs**，
或在仓库目录运行：

```bash
npx wrangler tail omni-mail --format json
```

建议优先按 `event` 字段筛选：

| `event` | 含义 | 关键字段 |
| --- | --- | --- |
| `qq_mail_sync_failed` | QQ 邮箱同步失败 | `account_id`、`stage`、`error_code`、`reason`、`attempt`、`duration_ms` |
| `qq_mail_sync_claim_failed` | 无法获取 QQ 同步租约 | `account_id`、`reason`、`attempt` |
| `qq_mail_sync_failure_record_failed` | 同步失败后无法写入 D1 状态 | `account_id`、`failed_stage`、`original_error_code` |
| `qq_mail_sync_completed` | 手动或首次 QQ 同步完成 | `account_id`、拉取数量和耗时 |
| `client_ui_crash` | 已登录 Web 客户端发生 React 崩溃 | `crash_id`、`user_id`、`path`、`error_type`、`component_stack` |
| `api_unhandled_error` | HTTP API 未处理异常 | `method`、`path`、`cf_ray` |

QQ 同步的 `stage` 可为 `claim`、`load_account`、`connect`、`examine`、
`read_index`、`search`、`fetch_metadata`、`prepare` 或 `persist`。用户提供恢复页上的
诊断编号后，可直接用 `crash_id` 检索对应的 `client_ui_crash`。
