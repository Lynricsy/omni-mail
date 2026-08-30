import type { Env } from '../../app/types'

export const BACKUP_DATABASE_IDENTITY = 'backup_database_identity'

type QueryResponse = {
  success?: boolean
  result?: Array<{
    success?: boolean
    results?: Array<{ value?: string }>
  }>
  errors?: Array<{ message?: string }>
}

function responseError(response: QueryResponse, fallback: string): Error {
  const detail = response.errors?.map((item) => item.message).filter(Boolean).join('; ')
  return new Error(detail || fallback)
}

export async function validateBackupTarget(env: Env): Promise<void> {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const databaseId = env.D1_DATABASE_ID?.trim()
  const token = env.D1_REST_API_TOKEN?.trim()
  if (!accountId || !databaseId || !token) {
    throw new Error('备份所需的 D1 账户、数据库 ID 或 API Token 未配置。')
  }

  const local = await env.DB.prepare(
    'SELECT value FROM settings WHERE key = ?',
  ).bind(BACKUP_DATABASE_IDENTITY).first<{ value: string }>()
  if (!local?.value) throw new Error('当前数据库缺少备份身份标识，请重新部署后重试。')

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}`
      + `/d1/database/${encodeURIComponent(databaseId)}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql: 'SELECT value FROM settings WHERE key = ?',
        params: [BACKUP_DATABASE_IDENTITY],
      }),
    },
  )
  const data: QueryResponse = await response.json<QueryResponse>().catch(() => ({}))
  const result = data.result?.[0]
  if (!response.ok || !data.success || !result?.success) {
    throw responseError(data, `无法验证备份目标数据库（${response.status}）。`)
  }
  if (result.results?.[0]?.value !== local.value) {
    throw new Error('D1_DATABASE_ID 与当前 Worker 的 DB 绑定不一致。')
  }
}
