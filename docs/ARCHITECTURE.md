# OmniMail 代码目录约定

本文说明 Web 前端和 Cloudflare Worker 的文件归属规则。目标是让新增功能可以通过目录定位，避免重新形成按文件类型堆积的扁平目录。

## 稳定入口

- `src/main.tsx` 是 Web 入口，只负责挂载应用和加载全局样式。
- `email-worker/src/index.ts` 是 Wrangler、Vitest Worker Pool 和 Cloudflare 的稳定入口。
- 两个入口都应保持精简；业务代码放入下面的分层目录。

## Web 前端

```text
src/
├─ main.tsx
├─ app/                       # 应用装配、导航、启动流程和全局样式
├─ features/                  # 按业务能力组织的纵向功能
│  ├─ admin/
│  ├─ api-guide/
│  ├─ auth/
│  ├─ compose/
│  ├─ deployment/
│  ├─ drafts/
│  ├─ extension-authorization/
│  ├─ gmail/
│  ├─ icloud/
│  ├─ linux-do-mail/
│  ├─ microsoft/
│  ├─ qq-mail/
│  ├─ mailbox/
│  ├─ messages/
│  └─ temporary-invites/
└─ shared/                    # 跨功能复用的基础能力
   ├─ api/
   ├─ auth/
   ├─ hooks/
   ├─ i18n/
   ├─ mail/
   ├─ platform/
   ├─ theme/
   └─ ui/
```

### 文件归属

- 页面、业务组件、业务 Hook、数据模型和专用样式放在对应的 `features/<feature>`。
- 只被一个功能使用的代码不进入 `shared`。
- 多个邮箱工作区共用的正文渲染、滚动行为和工作区外壳放在 `shared/ui/mail-workspace`。
- 全局设计变量、基础元素样式和全站响应式规则放在 `app/styles`。
- 功能 CSS 放在相应功能的 `styles` 中；大文件按组件区段或响应式区段拆分，并保持导入顺序。
- 测试文件与被测模块放在同一目录，不建立单独的全局测试目录。

前端 React 组件继续使用 PascalCase 文件名；Hook 使用 `useXxx.ts`；普通 TypeScript 模块沿用现有 camelCase 命名；CSS 使用 kebab-case。

## Cloudflare Worker

```text
email-worker/src/
├─ index.ts                   # Worker 稳定入口
├─ app/                       # Hono 装配、上下文、中间件、入口处理器和路由注册
├─ features/                  # 认证、邮箱 Provider、消息、管理、出站等业务能力
│  ├─ admin/
│  ├─ auth/
│  ├─ backups/
│  ├─ drafts/
│  ├─ extension-authorization/
│  ├─ gmail/
│  ├─ icloud/
│  ├─ invitations/
│  ├─ linux-do-mail/
│  ├─ microsoft/
│  ├─ mailboxes/
│  ├─ messages/
│  ├─ outbound/
│  └─ system/
├─ platform/                  # D1、IMAP、调度和 Cloudflare 运行时适配
└─ shared/                    # HTTP、审计、邮件等跨功能基础能力
```

### Worker 边界

- `app/api.ts` 只负责创建 Hono 应用并注册中间件和领域路由。
- `app/context.ts` 定义 Hono 绑定和变量，功能路由不能从 `app/api.ts` 反向导入类型。
- HTTP 路由负责解析请求和组合响应，业务处理放在相应功能模块。
- D1 schema 执行逻辑放在 `platform/d1/schema.ts`，迁移定义放在 `schema-migrations.ts`。
- 通用 IMAP 连接放在 `platform/imap`，Provider 专有协议和存储逻辑留在对应 Provider 功能中。
- Worker 文件和目录统一使用 kebab-case；测试与实现相邻。

## 依赖方向

一般依赖方向如下：

```text
Web:     main → app → features → shared
Worker:  index → app → features → platform/shared
```

功能之间确实需要协作时，应依赖目标功能的服务或类型模块，不应引用其路由装配文件。`shared/api/api-client.ts` 是当前 Web API 客户端的统一兼容入口，可以组合各功能的纯 API client factory，但不能依赖功能组件或 UI 状态。

避免以下做法：

- 在 `src` 或 `email-worker/src` 根目录直接添加新的业务文件。
- 重新创建 `src/components`、`src/lib`、`src/styles` 等中央堆积目录。
- 让共享模块依赖具体页面组件。
- 使用大量 `index.ts` 隐藏深层循环依赖；只有稳定公共入口才使用聚合导出。
- 在目录移动的同一提交中修改业务行为。

## 新功能放置示例

新增 Microsoft 邮箱 Provider 时，建议使用：

```text
src/features/microsoft/
├─ api/
├─ components/
├─ model/
└─ styles/

email-worker/src/features/microsoft/
├─ microsoft-api.ts
├─ microsoft-credentials.ts
├─ microsoft-imap.ts
├─ microsoft-routes.ts
├─ microsoft-store.ts
└─ 对应测试文件
```

Provider 共用的能力应先判断是否已经存在于 `shared/mail`、`shared/ui/mail-workspace` 或 `platform/imap`，不要复制另一 Provider 的内部文件，也不要用 `icloud-*` 等 Provider 专有名称承载公共样式。

Linux DO Mail 与 QQ 邮箱的受控 SMTP 会话和 MIME 序列化位于
`email-worker/src/shared/mail/smtp-client.ts`；Provider 文件只固定端点、认证方式和错误映射。

## 验证要求

目录或模块边界调整后至少运行：

```bash
npm run check
npm test
npm run test:worker
npm run build
```

修改扩展共享类型或 UI 时还要运行 `npm run test:extension`；修改 API catalog 时运行 `npm run docs:api`，并确认生成文档没有遗漏端点。
