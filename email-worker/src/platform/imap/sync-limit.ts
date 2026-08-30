import type { MailSyncLimit } from '../../app/types'

export const DEFAULT_MAIL_SYNC_LIMIT: MailSyncLimit = 20
export const RECENT_MESSAGE_REFRESH_LIMIT = 20

export function parseMailSyncLimit(value: unknown): MailSyncLimit | null {
  return value === 10 || value === 20 || value === 50 ? value : null
}

export async function requestedMailSyncLimit(request: Request): Promise<MailSyncLimit> {
  const source = await request.text()
  if (!source.trim()) return DEFAULT_MAIL_SYNC_LIMIT
  const body = JSON.parse(source) as unknown
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('invalid body')
  const value = (body as Record<string, unknown>).limit
  if (value === undefined) return DEFAULT_MAIL_SYNC_LIMIT
  const limit = parseMailSyncLimit(value)
  if (!limit) throw new Error('invalid limit')
  return limit
}
