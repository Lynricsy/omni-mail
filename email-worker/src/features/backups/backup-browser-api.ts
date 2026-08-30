import { attachmentDisposition } from '../../shared/http/api-helpers'
import { writeAudit } from '../../shared/audit/audit'
import { backupIdentity, backupScope, scopedBackupKey } from './backup-scope'
import type { Env, SessionUser } from '../../app/types'

const BACKUP_PREFIXES = [
  'd1/daily/',
  'd1/weekly/',
  'd1/monthly/',
  'mail/raw/',
  'mail/sent/',
] as const

type BackupPrefix = typeof BACKUP_PREFIXES[number]

type DrillCheck = {
  label: string
  passed: boolean
  detail: string
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function isSuperAdministrator(user: SessionUser): boolean {
  return user.role === 'super_admin'
}

export function validBackupPrefix(value: string): value is BackupPrefix {
  return BACKUP_PREFIXES.includes(value as BackupPrefix)
}

function validBackupKey(value: string): boolean {
  return value.length > 0
    && value.length <= 1024
    && BACKUP_PREFIXES.some((prefix) => value.startsWith(prefix))
}

export function inspectBackupSample(
  key: string,
  sample: string,
  size: number,
): DrillCheck[] {
  const checks: DrillCheck[] = [{
    label: '对象可读取',
    passed: size > 0,
    detail: size > 0 ? `对象大小 ${size} 字节` : '对象为空',
  }]
  if (key.startsWith('d1/')) {
    const looksLikeSql = /\b(PRAGMA|CREATE\s+TABLE|BEGIN\s+TRANSACTION)\b/i.test(sample)
    checks.push({
      label: 'D1 导出结构',
      passed: looksLikeSql,
      detail: looksLikeSql ? '检测到 SQLite/D1 导出语句' : '未检测到预期 SQL 头部',
    })
  } else if (key.startsWith('mail/raw/')) {
    const looksLikeMail = /^(From|Return-Path):/im.test(sample)
      && /^(To|Delivered-To|Subject):/im.test(sample)
    checks.push({
      label: '原始邮件结构',
      passed: looksLikeMail,
      detail: looksLikeMail ? '检测到 RFC 822 邮件头' : '邮件头不完整',
    })
  } else if (!key.includes('/attachments/')) {
    let validJson = false
    try {
      const body = JSON.parse(sample) as { text?: unknown; html?: unknown }
      validJson = typeof body.text === 'string' && typeof body.html === 'string'
    } catch {
      validJson = false
    }
    checks.push({
      label: '发件正文结构',
      passed: validJson,
      detail: validJson ? '正文 JSON 可以解析' : '正文 JSON 无效',
    })
  }
  return checks
}

export async function listBackupObjects(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  if (!isSuperAdministrator(user)) return json({ error: '只有主管理员可以浏览备份。' }, 403)
  if (!env.BACKUP_BUCKET) return json({ error: '备份存储尚未配置。' }, 503)
  const params = new URL(request.url).searchParams
  const prefix = params.get('prefix') || 'd1/daily/'
  const cursor = params.get('cursor') || undefined
  const limit = Number(params.get('limit') || 30)
  if (!validBackupPrefix(prefix)) return json({ error: '备份分类无效。' }, 400)
  if (cursor && cursor.length > 2048) return json({ error: '备份分页游标无效。' }, 400)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return json({ error: '备份分页大小无效。' }, 400)
  }
  const identity = await backupIdentity(env.DB)
  const scope = backupScope(identity)
  const listed = await env.BACKUP_BUCKET.list({
    prefix: scopedBackupKey(identity, prefix), cursor, limit,
  })
  return json({
    prefix,
    objects: listed.objects.map((object) => ({
      key: object.key.slice(scope.length),
      size: object.size,
      uploadedAt: object.uploaded.getTime(),
      etag: object.etag,
    })),
    page: {
      hasMore: listed.truncated,
      nextCursor: listed.truncated ? listed.cursor || null : null,
    },
  })
}

export async function downloadBackupObject(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  if (!isSuperAdministrator(user)) return json({ error: '只有主管理员可以下载备份。' }, 403)
  if (!env.BACKUP_BUCKET) return json({ error: '备份存储尚未配置。' }, 503)
  const key = new URL(request.url).searchParams.get('key') || ''
  if (!validBackupKey(key)) return json({ error: '备份对象键无效。' }, 400)
  const object = await env.BACKUP_BUCKET.get(scopedBackupKey(await backupIdentity(env.DB), key))
  if (!object) return json({ error: '备份对象不存在。' }, 404)
  const filename = object.customMetadata?.filename || key.split('/').at(-1) || 'backup'
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': String(object.size),
      'Content-Disposition': attachmentDisposition(filename),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function runBackupDrill(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isSuperAdministrator(user)) return json({ error: '只有主管理员可以执行恢复演练。' }, 403)
  if (!env.BACKUP_BUCKET) return json({ error: '备份存储尚未配置。' }, 503)
  const input = await request.json<{ key?: string }>().catch(() => ({} as { key?: string }))
  const key = input.key?.trim() || ''
  if (!validBackupKey(key)) return json({ error: '备份对象键无效。' }, 400)
  const scopedKey = scopedBackupKey(await backupIdentity(env.DB), key)
  const metadata = await env.BACKUP_BUCKET.head(scopedKey)
  if (!metadata) return json({ error: '备份对象不存在。' }, 404)
  const fullJson = key.startsWith('mail/sent/')
    && !key.includes('/attachments/')
    && metadata.size <= 512 * 1024
  const object = await env.BACKUP_BUCKET.get(scopedKey, fullJson
    ? undefined
    : { range: { offset: 0, length: Math.min(metadata.size, 64 * 1024) } })
  if (!object) return json({ error: '备份对象无法读取。' }, 502)
  const checks = inspectBackupSample(key, await object.text(), metadata.size)
  const passed = checks.every((check) => check.passed)
  await writeAudit(env, user.id, 'system.backup_drill', key, ip, { passed, checks })
  return json({
    result: {
      key,
      status: passed ? 'passed' : 'failed',
      size: metadata.size,
      checkedAt: Date.now(),
      checks,
    },
  })
}
