export const BACKUP_RETENTION_DAYS = {
  daily: 30,
  weekly: 84,
  monthly: 365,
  mail: 90,
} as const

export const BACKUP_RETENTION_RULES = [
  { prefix: 'd1/daily/', days: BACKUP_RETENTION_DAYS.daily },
  { prefix: 'd1/weekly/', days: BACKUP_RETENTION_DAYS.weekly },
  { prefix: 'd1/monthly/', days: BACKUP_RETENTION_DAYS.monthly },
  { prefix: 'mail/raw/', days: BACKUP_RETENTION_DAYS.mail },
  { prefix: 'mail/sent/', days: BACKUP_RETENTION_DAYS.mail },
] as const

export async function purgeBackupObjectsPage(
  bucket: R2Bucket,
  prefix: string,
  cutoffMs: number,
  cursor?: string,
): Promise<{ deleted: number; hasMore: boolean; nextCursor: string | null }> {
  const listed = await bucket.list({ prefix, limit: 1000, cursor })
  const expiredKeys = listed.objects
    .filter((object) => object.uploaded.getTime() < cutoffMs)
    .map((object) => object.key)
  if (expiredKeys.length) await bucket.delete(expiredKeys)
  const nextCursor = listed.truncated ? listed.cursor || null : null
  return {
    deleted: expiredKeys.length,
    hasMore: Boolean(nextCursor),
    nextCursor,
  }
}
