import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createServer } from 'vite'

const root = process.cwd()
const outputDirectory = path.join(root, 'docs', 'api')
const groupFiles = {
  system: 'system.md',
  auth: 'authentication.md',
  mailboxes: 'mailboxes.md',
  messages: 'messages.md',
  drafts: 'drafts.md',
  icloud: 'icloud.md',
  gmail: 'gmail.md',
  microsoft: 'microsoft.md',
  qqMail: 'qq-mail.md',
  naverMail: 'naver-mail.md',
  yandexMail: 'yandex-mail.md',
  linuxdoMail: 'linux-do-mail.md',
  adminOperations: 'admin-operations.md',
  adminAccess: 'admin-access.md',
  adminSettings: 'admin-settings.md',
}

const authLabels = {
  public: '公开，无需登录',
  optional: '可选登录；登录后可能返回更多当前用户信息',
  authenticated: '登录用户；支持 Session Cookie 或 Access Token',
  cookie: '浏览器 Session Cookie',
  admin: '管理员或主管理员',
  superAdmin: '仅主管理员',
  webhook: 'Webhook 签名验证',
}

function generatedNotice() {
  return [
    '<!-- 此文件由 npm run docs:api 自动生成，请修改 src/features/api-guide/model/apiCatalog*.ts 后重新生成。 -->',
    '',
  ]
}

function tableText(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>')
}

function endpointFingerprint(endpoint) {
  return createHash('sha256').update(JSON.stringify(endpoint)).digest('hex').slice(0, 12)
}

function endpointMarkdown(endpoint, helpers) {
  const lines = [
    `<!-- endpoint:${helpers.apiEndpointKey(endpoint)} catalog:${endpointFingerprint(endpoint)} -->`,
    `## \`${endpoint.method} ${helpers.displayApiPath(endpoint.path)}\``,
    '',
    `**${endpoint.title.zh} / ${endpoint.title.en}**`,
    '',
    endpoint.description.zh,
    '',
    `> ${endpoint.description.en}`,
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| 认证 | ${tableText(authLabels[endpoint.auth] || endpoint.auth)} |`,
    `| 请求 | ${tableText(endpoint.request)} |`,
    `| 成功响应 | ${tableText(endpoint.response)} |`,
    '',
  ]
  for (const note of endpoint.notes || []) {
    lines.push(`> 注意：${note.zh}`, '>', `> Note: ${note.en}`, '')
  }
  lines.push('### cURL 示例', '', '```bash')
  lines.push(helpers.apiEndpointCurl(endpoint, 'https://mail.example.com/api'))
  lines.push('```', '')
  return lines
}

function groupMarkdown(group, endpoints, helpers) {
  return [
    ...generatedNotice(),
    `# ${group.title.zh}`,
    '',
    `**${group.title.en}**`,
    '',
    group.description.zh,
    '',
    `> ${group.description.en}`,
    '',
    `本分类共 **${endpoints.length}** 个端点。返回 [完整 API 索引](README.md) 或 [API 架构与安全说明](../API.md)。`,
    '',
    ...endpoints.flatMap((endpoint) => endpointMarkdown(endpoint, helpers)),
  ].join('\n')
}

function indexMarkdown(groups, endpoints) {
  const methodCounts = new Map()
  for (const endpoint of endpoints) {
    methodCounts.set(endpoint.method, (methodCounts.get(endpoint.method) || 0) + 1)
  }
  const lines = [
    ...generatedNotice(),
    '# OmniMail 完整 HTTP API 参考',
    '',
    `当前 Worker 共公开 **${endpoints.length}** 个 HTTP 端点。本文档由代码中的 API Catalog 自动生成，`,
    '与 Webmail `/settings/api` 使用同一份数据源。架构、安全模型、限速和数据生命周期说明见',
    '[`docs/API.md`](../API.md)。',
    '',
    '## 基础地址',
    '',
    '```text',
    'https://mail.example.com/api',
    '```',
    '',
    '将 `mail.example.com` 替换为自己的 OmniMail 域名。路径已经包含 `/api`，请勿重复拼接。',
    '',
    '## 认证方式',
    '',
    '| Catalog 值 | 调用方式 |',
    '| --- | --- |',
    ...Object.entries(authLabels).map(([key, value]) => `| \`${key}\` | ${value} |`),
    '',
    'Access Token 使用 `Authorization: Bearer om_at_...`。浏览器 Session 使用 `HttpOnly` Cookie；',
    'Webhook 端点按文档示例提交 Svix 签名头。除公开端点外，服务端仍会检查角色、资源归属和功能权限。',
    '',
    '## 方法统计',
    '',
    '| 方法 | 数量 |',
    '| --- | ---: |',
    ...[...methodCounts.entries()].map(([method, count]) => `| \`${method}\` | ${count} |`),
    '',
    '## 分类索引',
    '',
    '| 分类 | 端点数 | 说明 |',
    '| --- | ---: | --- |',
  ]
  for (const group of groups) {
    const count = endpoints.filter((endpoint) => endpoint.group === group.id).length
    lines.push(`| [${group.title.zh}](${groupFiles[group.id]}) | ${count} | ${group.description.zh} |`)
  }
  lines.push(
    '',
    '## 通用约定',
    '',
    '- JSON 请求使用 `Content-Type: application/json`；文件上传端点使用 `multipart/form-data`。',
    '- 认证失败通常返回 `401`，权限不足返回 `403`，资源不存在返回 `404`。',
    '- 参数冲突或当前状态不允许操作时通常返回 `409`；限速返回 `429`，并可能包含 `Retry-After`。',
    '- 错误响应统一使用 `{ "error": "可读错误信息" }`；不要依赖错误文案做程序分支。',
    '- 分页端点的游标是不透明值，应原样传回，不能自行解析或拼接。',
    '- Cookie、密码、Refresh Token、iCloud 凭据等敏感字段不会通过查询接口回传。',
    '',
    '## 重新生成',
    '',
    '```bash',
    'npm run docs:api',
    '```',
    '',
    '提交前运行 `npm test`；API Catalog 测试会验证真实路由、应用内目录和这些分类文档完全一致。',
    '',
  )
  return lines.join('\n')
}

await mkdir(outputDirectory, { recursive: true })
for (const filename of ['README.md', ...Object.values(groupFiles)]) {
  await rm(path.join(outputDirectory, filename), { force: true })
}

const vite = await createServer({
  root,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
})

try {
  const catalog = await vite.ssrLoadModule('/src/features/api-guide/model/apiCatalog.ts')
  const helpers = {
    apiEndpointCurl: catalog.apiEndpointCurl,
    apiEndpointKey: catalog.apiEndpointKey,
    displayApiPath: catalog.displayApiPath,
  }
  await writeFile(
    path.join(outputDirectory, 'README.md'),
    indexMarkdown(catalog.apiGroups, catalog.apiEndpoints),
  )
  for (const group of catalog.apiGroups) {
    const endpoints = catalog.apiEndpoints.filter((endpoint) => endpoint.group === group.id)
    await writeFile(
      path.join(outputDirectory, groupFiles[group.id]),
      groupMarkdown(group, endpoints, helpers),
    )
  }
  console.log(`Generated ${catalog.apiEndpoints.length} endpoints in ${catalog.apiGroups.length} groups.`)
} finally {
  await vite.close()
}
