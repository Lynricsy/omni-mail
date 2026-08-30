import { writeAudit } from '../../../shared/audit/audit'
import { BACKUP_RETENTION_DAYS } from '../../backups/backup-retention'
import { validateBackupTarget } from '../../backups/backup-target'
import {
  DRAFT_LIMIT_SETTINGS,
  draftLimitsFromSettings,
  validDraftLimits,
  type DraftLimits,
} from '../../drafts/draft-policy'
import { pruneDraftsForLimits } from '../../drafts/draft-api'
import type { Env, SessionUser, UserRole } from '../../../app/types'

const SETTINGS = {
  backupEnabled: 'backup_enabled',
  trashDays: 'trash_retention_days',
  temporaryDays: 'temporary_data_retention_days',
  auditDays: 'audit_retention_days',
  failedDays: 'failed_message_retention_days',
  userQuotaMiB: 'default_user_quota_mib',
  temporaryQuotaMiB: 'default_temporary_quota_mib',
} as const

const DEFAULTS = {
  trashDays: 30,
  temporaryDays: 7,
  auditDays: 180,
  failedDays: 7,
  userQuotaMiB: 1024,
  temporaryQuotaMiB: 256,
} as const

type BackupRun = {
  id: string
  trigger: 'scheduled' | 'manual' | 'enable'
  status: 'running' | 'succeeded' | 'failed'
  object_key: string | null
  size: number
  error: string | null
  started_at: number
  completed_at: number | null
}

export interface StoragePolicy {
  backupEnabled: boolean
  backupReady: boolean
  backupMissing: string[]
  backupRetention: {
    dailyDays: 30
    weeklyDays: 84
    monthlyDays: 365
    mailDays: 90
  }
  trashRetentionDays: number
  temporaryDataRetentionDays: number
  auditRetentionDays: number
  failedMessageRetentionDays: number
  defaultUserQuotaMiB: number
  defaultTemporaryQuotaMiB: number
  draftLimits: DraftLimits
  lastBackup: {
    id: string
    trigger: BackupRun['trigger']
    status: BackupRun['status']
    objectKey: string | null
    size: number
    error: string | null
    startedAt: number
    completedAt: number | null
  } | null
}

type StoragePolicyInput = {
  backupEnabled?: unknown
  trashRetentionDays?: unknown
  temporaryDataRetentionDays?: unknown
  auditRetentionDays?: unknown
  failedMessageRetentionDays?: unknown
  defaultUserQuotaMiB?: unknown
  defaultTemporaryQuotaMiB?: unknown
  draftLimits?: unknown
}

function isAdministrator(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin'
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function integerSetting(
  settings: Map<string, string>,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(settings.get(key))
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback
}

function validInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= minimum
    && value <= maximum
}

export function backupMissingConfiguration(env: Env): string[] {
  const missing: string[] = []
  if (!env.BACKUP_BUCKET) missing.push('BACKUP_BUCKET')
  if (!env.BACKUP_WORKFLOW) missing.push('BACKUP_WORKFLOW')
  if (!env.CLOUDFLARE_ACCOUNT_ID?.trim()) missing.push('CLOUDFLARE_ACCOUNT_ID')
  if (!env.D1_DATABASE_ID?.trim()) missing.push('D1_DATABASE_ID')
  if (!env.D1_REST_API_TOKEN?.trim()) missing.push('D1_REST_API_TOKEN')
  return missing
}

export async function storagePolicy(env: Env): Promise<StoragePolicy> {
  const keys = [...Object.values(SETTINGS), ...Object.values(DRAFT_LIMIT_SETTINGS)]
  const { results } = await env.DB.prepare(
    `SELECT key, value FROM settings
      WHERE key IN (${keys.map(() => '?').join(', ')})`,
  ).bind(...keys).all<{ key: string; value: string }>()
  const settings = new Map(results.map((row) => [row.key, row.value]))
  const backupMissing = backupMissingConfiguration(env)
  const last = await env.DB.prepare(
    `SELECT id, trigger, status, object_key, size, error, started_at, completed_at
       FROM backup_runs ORDER BY started_at DESC LIMIT 1`,
  ).first<BackupRun>()

  return {
    backupEnabled: settings.get(SETTINGS.backupEnabled) === '1',
    backupReady: backupMissing.length === 0,
    backupMissing,
    backupRetention: {
      dailyDays: BACKUP_RETENTION_DAYS.daily,
      weeklyDays: BACKUP_RETENTION_DAYS.weekly,
      monthlyDays: BACKUP_RETENTION_DAYS.monthly,
      mailDays: BACKUP_RETENTION_DAYS.mail,
    },
    trashRetentionDays: integerSetting(
      settings, SETTINGS.trashDays, DEFAULTS.trashDays, 1, 90,
    ),
    temporaryDataRetentionDays: integerSetting(
      settings, SETTINGS.temporaryDays, DEFAULTS.temporaryDays, 1, 90,
    ),
    auditRetentionDays: integerSetting(
      settings, SETTINGS.auditDays, DEFAULTS.auditDays, 30, 3650,
    ),
    failedMessageRetentionDays: integerSetting(
      settings, SETTINGS.failedDays, DEFAULTS.failedDays, 1, 30,
    ),
    defaultUserQuotaMiB: integerSetting(
      settings, SETTINGS.userQuotaMiB, DEFAULTS.userQuotaMiB, 64, 102400,
    ),
    defaultTemporaryQuotaMiB: integerSetting(
      settings, SETTINGS.temporaryQuotaMiB, DEFAULTS.temporaryQuotaMiB, 16, 10240,
    ),
    draftLimits: draftLimitsFromSettings(settings),
    lastBackup: last ? {
      id: last.id,
      trigger: last.trigger,
      status: last.status,
      objectKey: last.object_key,
      size: last.size,
      error: last.error,
      startedAt: last.started_at,
      completedAt: last.completed_at,
    } : null,
  }
}

export async function backupEnabled(db: D1Database): Promise<boolean> {
  const setting = await db.prepare(
    'SELECT value FROM settings WHERE key = ?',
  ).bind(SETTINGS.backupEnabled).first<{ value: string }>()
  return setting?.value === '1'
}

export async function defaultQuotaBytes(db: D1Database, role: UserRole): Promise<number> {
  if (role === 'super_admin' || role === 'admin') return 5 * 1024 * 1024 * 1024
  const policy = await policyValues(db)
  const quotaMiB = role === 'temporary'
    ? policy.defaultTemporaryQuotaMiB
    : policy.defaultUserQuotaMiB
  return quotaMiB * 1024 * 1024
}

export async function retentionValues(db: D1Database) {
  return policyValues(db)
}

async function policyValues(db: D1Database) {
  const keys = [
    SETTINGS.trashDays,
    SETTINGS.temporaryDays,
    SETTINGS.auditDays,
    SETTINGS.failedDays,
    SETTINGS.userQuotaMiB,
    SETTINGS.temporaryQuotaMiB,
  ]
  const { results } = await db.prepare(
    `SELECT key, value FROM settings
      WHERE key IN (${keys.map(() => '?').join(', ')})`,
  ).bind(...keys).all<{ key: string; value: string }>()
  const settings = new Map(results.map((row) => [row.key, row.value]))
  return {
    trashRetentionDays: integerSetting(
      settings, SETTINGS.trashDays, DEFAULTS.trashDays, 1, 90,
    ),
    temporaryDataRetentionDays: integerSetting(
      settings, SETTINGS.temporaryDays, DEFAULTS.temporaryDays, 1, 90,
    ),
    auditRetentionDays: integerSetting(
      settings, SETTINGS.auditDays, DEFAULTS.auditDays, 30, 3650,
    ),
    failedMessageRetentionDays: integerSetting(
      settings, SETTINGS.failedDays, DEFAULTS.failedDays, 1, 30,
    ),
    defaultUserQuotaMiB: integerSetting(
      settings, SETTINGS.userQuotaMiB, DEFAULTS.userQuotaMiB, 64, 102400,
    ),
    defaultTemporaryQuotaMiB: integerSetting(
      settings, SETTINGS.temporaryQuotaMiB, DEFAULTS.temporaryQuotaMiB, 16, 10240,
    ),
  }
}

export async function updateStoragePolicy(
  env: Env,
  actor: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) return json({ error: '只有管理员可以修改存储策略。' }, 403)
  const input = await request.json<StoragePolicyInput>()
    .catch(() => ({} as StoragePolicyInput))
  if (
    typeof input.backupEnabled !== 'boolean'
    || !validInteger(input.trashRetentionDays, 1, 90)
    || !validInteger(input.temporaryDataRetentionDays, 1, 90)
    || !validInteger(input.auditRetentionDays, 30, 3650)
    || !validInteger(input.failedMessageRetentionDays, 1, 30)
    || !validInteger(input.defaultUserQuotaMiB, 64, 102400)
    || !validInteger(input.defaultTemporaryQuotaMiB, 16, 10240)
    || !validDraftLimits(input.draftLimits)
  ) return json({ error: '备份、保留、草稿或默认配额设置无效。' }, 400)

  const previous = await storagePolicy(env)
  const missing = backupMissingConfiguration(env)
  if (input.backupEnabled && missing.length) {
    return json({ error: `备份资源尚未配置：${missing.join('、')}` }, 503)
  }
  if (input.backupEnabled && !previous.backupEnabled) {
    try {
      await validateBackupTarget(env)
    } catch (error) {
      return json({
        error: error instanceof Error ? error.message : '无法验证备份目标数据库。',
      }, 503)
    }
  }

  const values: Array<[string, string]> = [
    [SETTINGS.backupEnabled, input.backupEnabled ? '1' : '0'],
    [SETTINGS.trashDays, String(input.trashRetentionDays)],
    [SETTINGS.temporaryDays, String(input.temporaryDataRetentionDays)],
    [SETTINGS.auditDays, String(input.auditRetentionDays)],
    [SETTINGS.failedDays, String(input.failedMessageRetentionDays)],
    [SETTINGS.userQuotaMiB, String(input.defaultUserQuotaMiB)],
    [SETTINGS.temporaryQuotaMiB, String(input.defaultTemporaryQuotaMiB)],
    [DRAFT_LIMIT_SETTINGS.superAdmin, String(input.draftLimits.superAdmin)],
    [DRAFT_LIMIT_SETTINGS.admin, String(input.draftLimits.admin)],
    [DRAFT_LIMIT_SETTINGS.user, String(input.draftLimits.user)],
    [DRAFT_LIMIT_SETTINGS.temporary, String(input.draftLimits.temporary)],
  ]
  await env.DB.batch(values.map(([key, value]) => env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
  ).bind(key, value)))
  await env.DB.prepare(
    `UPDATE messages
        SET purge_after = trashed_at + ? * 86400
      WHERE folder = 'trash' AND trashed_at IS NOT NULL`,
  ).bind(input.trashRetentionDays).run()
  await pruneDraftsForLimits(env, input.draftLimits)
  await writeAudit(env, actor.id, 'system.storage_policy.update', null, ip, {
    backupEnabled: input.backupEnabled,
    trashRetentionDays: input.trashRetentionDays,
    temporaryDataRetentionDays: input.temporaryDataRetentionDays,
    auditRetentionDays: input.auditRetentionDays,
    failedMessageRetentionDays: input.failedMessageRetentionDays,
    defaultUserQuotaMiB: input.defaultUserQuotaMiB,
    defaultTemporaryQuotaMiB: input.defaultTemporaryQuotaMiB,
    draftLimits: input.draftLimits,
  })

  if (input.backupEnabled && !previous.backupEnabled) {
    try {
      await env.BACKUP_WORKFLOW!.create({
        id: `enable-${Date.now()}-${crypto.randomUUID()}`,
        params: { trigger: 'enable', requestedBy: actor.id, includeMail: true },
        retention: { successRetention: '3 days', errorRetention: '3 days' },
      })
    } catch (error) {
      await env.DB.prepare(
        `UPDATE settings SET value = '0', updated_at = unixepoch()
          WHERE key = ?`,
      ).bind(SETTINGS.backupEnabled).run()
      return json({
        error: error instanceof Error ? error.message : '无法启动首次备份。',
      }, 502)
    }
  }
  return json({ storagePolicy: await storagePolicy(env) })
}

export async function startManualBackup(
  env: Env,
  actor: SessionUser,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(actor)) return json({ error: '只有管理员可以启动备份。' }, 403)
  const policy = await storagePolicy(env)
  if (!policy.backupEnabled) return json({ error: '请先开启自动备份。' }, 409)
  if (!policy.backupReady || !env.BACKUP_WORKFLOW) {
    return json({ error: `备份资源尚未配置：${policy.backupMissing.join('、')}` }, 503)
  }
  try {
    await validateBackupTarget(env)
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : '无法验证备份目标数据库。',
    }, 503)
  }
  const id = `manual-${Date.now()}-${crypto.randomUUID()}`
  await env.BACKUP_WORKFLOW.create({
    id,
    params: { trigger: 'manual', requestedBy: actor.id, includeMail: true },
    retention: { successRetention: '3 days', errorRetention: '3 days' },
  })
  await writeAudit(env, actor.id, 'system.backup.start', id, ip, {})
  return json({ id }, 202)
}

export async function startScheduledBackup(env: Env, now: number): Promise<void> {
  if (backupMissingConfiguration(env).length || !await backupEnabled(env.DB)) return
  const day = new Date(now * 1000).toISOString().slice(0, 10)
  const claim = await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('last_scheduled_backup_day', ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at
     WHERE settings.value != excluded.value`,
  ).bind(day, now).run()
  if (!claim.meta.changes) return
  try {
    await env.BACKUP_WORKFLOW!.create({
      id: `scheduled-${day}`,
      params: { trigger: 'scheduled', includeMail: false },
      retention: { successRetention: '3 days', errorRetention: '3 days' },
    })
  } catch (error) {
    await env.DB.prepare(
      `DELETE FROM settings
        WHERE key = 'last_scheduled_backup_day' AND value = ?`,
    ).bind(day).run()
    throw error
  }
}
