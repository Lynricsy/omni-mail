import { BACKUP_DATABASE_IDENTITY } from './backup-target'

const BACKUP_IDENTITY = /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i

export async function backupIdentity(db: D1Database): Promise<string> {
  const row = await db.prepare(
    'SELECT value FROM settings WHERE key = ?',
  ).bind(BACKUP_DATABASE_IDENTITY).first<{ value: string }>()
  const value = row?.value?.trim()
  if (!value || !BACKUP_IDENTITY.test(value)) {
    throw new Error('当前数据库缺少有效的备份身份标识。')
  }
  return value.toLowerCase()
}

export function backupScope(identity: string): string {
  return `instances/${identity}/`
}

export function scopedBackupKey(identity: string, key: string): string {
  return `${backupScope(identity)}${key}`
}
